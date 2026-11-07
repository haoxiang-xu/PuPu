"""Read actual App Journal/CAS on a private checkpointed copy after shutdown."""
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sqlite3

from skeleton_production_state import canonical, prepare_agent_graph, validate_launch_descriptor
from skeleton_workflow_tools import resolve_workflow_tool
from unchain.journal import ArtifactRef, AttemptRef, ResourceRef
from unchain.journal.models import _thaw_json
from unchain.persistence.sqlite_v2 import open_existing_execution_journal_readonly
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from enter_ledger import verify_enter_ledger


def tree_inventory(root):
    rows = {}
    for path in root.rglob('*'):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            target = os.readlink(path).encode()
            rows[relative] = {'sha256': sha256(target).hexdigest(), 'size': len(target), 'type': 'symlink'}
        elif path.is_file():
            raw = path.read_bytes()
            rows[relative] = {'sha256': sha256(raw).hexdigest(), 'size': len(raw), 'type': 'file'}
    return rows


def verify_raw_capture(out):
    capture = json.loads((out / 'raw-state-capture.json').read_text())
    assert capture['status'] == 'CAPTURED_AFTER_SHUTDOWN', capture
    assert capture['auth_scan_required'] is True
    assert capture['shutdown_proof']['all_owned_dead'] is True
    raw = out / 'raw-state'
    home = out / 'home'
    assert os.path.commonpath([str(raw.resolve()), str(home.resolve())]) != str(home.resolve())
    source_files = {row['path']: row for row in capture['source_inventory']}
    raw_files = tree_inventory(raw)
    expected_raw = {}
    for mapping in capture['copy_map']:
        source = source_files[mapping['source']]
        target = raw_files[mapping['raw']]
        assert (source['sha256'], source['size']) == (target['sha256'], target['size']), mapping
        expected_raw[mapping['raw']] = target
    assert set(expected_raw) == set(raw_files), 'raw-state inventory has unlisted or missing bytes'
    assert 'context_v2.sqlite3' in raw_files and 'objects' in {p.split('/')[0] for p in raw_files}
    return capture, raw, raw_files


def verify_packaged_workflow_tool():
    out = Path(os.environ["QA_OUT"])
    read = lambda name: json.loads((out / name).read_text())
    functional = read("functional-result.json")
    assert functional["verdict"] == "APP_ENTRY_HARNESS_COMPLETE_AUTH_SCAN_PENDING"
    assert functional["auth_scan_required"] is True
    assert functional["raw_state_status"] == "CAPTURED_AFTER_SHUTDOWN"
    assert read("errors.json") == []
    generations = read("process-generations.json")
    assert len(generations) == 4 and all(row["all_owned_dead"] is True for row in generations)
    assert all(int(old["stopped_ns"]) < int(new["started_ns"]) for old, new in zip(generations, generations[1:]))
    assert len({row["main"]["pid"] for row in generations}) == 4
    sidecars = []
    for row in generations:
        candidates = [identity for identity in row["processes_at_ready"]
            if Path(identity["exe"]).name == "unchain-server"]
        assert candidates, "sidecar_process_identity_missing"
        assert all(sha256(Path(identity["exe"]).read_bytes()).hexdigest() == os.environ["QA_BINARY_SHA"]
            for identity in candidates), "sidecar_binary_mismatch"
        sidecars.append({(identity["pid"], identity["start_ticks"]) for identity in candidates})
    assert all(sidecars[a].isdisjoint(sidecars[b]) for a in range(len(sidecars)) for b in range(a + 1, len(sidecars)))
    saved = read("ui-saved-agent.json")
    assert read("cold-read-agent.json") == saved
    seed = read("seed-v2-bridge.json")
    app_root = Path(os.environ["QA_APP"]).parent
    expected_files = json.loads((out.parent / "app-files.json").read_text())
    actual_files = {str(p.relative_to(app_root)): sha256(p.read_bytes()).hexdigest()
        for p in app_root.rglob("*") if p.is_file()}
    assert actual_files == expected_files, "packaged_app_changed_during_execution"
    expected_document = saved["resource"]["document"]
    tool = next(row for row in expected_document["nodes"] if row["id"] == "tools")["config"]["workflow_tools"][0]
    assert tool == {"id": "echo_run", "workflow": {"workflow_id": "desktop-wf356",
        "revision_id": seed["published"]["version"]["revision_id"]}}
    wires = read("provider-wires.json")
    ledger = read("ledger.json")
    assert len(wires) == 10
    assert all(row.get('scenario') != 'lifecycle' for row in wires[:4])
    assert all(row.get('scenario') == 'lifecycle' for row in wires[4:])
    verify_enter_ledger(ledger, wires)
    for turn in (1, 2):
        assert f"Desktop Workflow Tool root reply {turn}" in (out / f"turn-{turn}-aria.txt").read_text()
    aria = (out / "turn-2-aria.txt").read_text()
    assert aria.index("Desktop Workflow Tool root reply 1") < aria.index("Desktop Workflow Tool root reply 2"), "visible_root_reply_order_changed"
    raw_capture, raw_state, raw_inventory_before = verify_raw_capture(out)
    source = raw_state / 'context_v2.sqlite3'
    copied = out / "journal-verification-copy"
    shutil.copytree(raw_state, copied)
    database = copied / source.name
    assert tree_inventory(copied) == raw_inventory_before, 'private verification copy differs from retained raw bytes'
    with sqlite3.connect(database) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        execution_ids = [row[0] for row in connection.execute(
            "SELECT DISTINCT execution_id FROM events WHERE event_type='pupu.skeleton.launch'")]
    normal = read('normal-chat.json')
    normal_sessions = {row['meta']['executionSessionId'] for row in normal['messages'] if row['role'] == 'assistant'}
    assert len(normal_sessions) == 1, 'normal_roots_not_in_the_same_chat'
    lifecycle = read('lifecycle-result.json')
    assert lifecycle['verdict'] == 'APP_LIFECYCLE_ACCEPTED'
    assert [row['name'] for row in lifecycle['cases']] == ['approved', 'cancelled', 'child']
    approval_cold = read('lifecycle-approval-cold-check.json')
    assert approval_cold['before'] == approval_cold['after'], 'pending approval identity/payload changed across cold restart'
    assert approval_cold['approval_provider_count_before_restart'] == 1
    assert approval_cold['approval_provider_count_after_restart'] == 1
    assert approval_cold['side_effect_absent_before_click'] is True
    assert approval_cold['pinned_revision'] == approval_cold['pinned_after'], 'cold Approval Agent pin changed'
    assert lifecycle['counts']['qa356-approval'] == 2, 'cold approval must make exactly one provider request and one resume'
    assert lifecycle['childReply'] != lifecycle['childEnd']
    parent_requests = [row for row in wires if row.get('body', {}).get('model') == 'qa356-parent']
    assert len(parent_requests) == 2
    assert lifecycle['childEnd'] in json.dumps(parent_requests[1]['body']['messages'])
    all_sessions = normal_sessions | {next(row for row in case['messages'] if row['role'] == 'assistant')['meta']['executionSessionId']
        for case in lifecycle['cases']}
    assert set(execution_ids) == all_sessions, 'extra_or_missing_chat_execution'
    execution_ids = list(normal_sessions)
    journal = open_existing_execution_journal_readonly(database_path=database,
        object_directory=copied / "objects", execution_id=execution_ids[0])
    events = journal.capture_snapshot().events
    (out / "canonical-journal.json").write_text(json.dumps([row.to_dict() for row in events], indent=2) + "\n")
    launches = [row for row in events if row.event_type == "pupu.skeleton.launch"]
    assert len(launches) == 2
    roots = []
    for turn, event in enumerate(launches, 1):
        artifact = ArtifactRef.from_dict(_thaw_json(event.payload["launch_ref"]))
        raw = journal.read_full_verified(artifact=artifact)
        assert sha256(raw).hexdigest() == event.payload["launch_sha256"]
        descriptor = json.loads(raw)
        assert canonical(descriptor) == raw
        assert descriptor["runtime_manifest"]["manifest_digest"] == os.environ["QA_MANIFEST"]
        assert descriptor["selection"]["document"] == expected_document, "executed_document_differs_from_ui_saved"
        assert descriptor["inputs"]["message"] == f"QA356 question {turn}"
        _, _, plan = validate_launch_descriptor(descriptor, session_id=execution_ids[0],
            root_run_id=event.attempt.attempt_id)
        store = WorkflowExecutionStore(journal, plan, graph_id=descriptor["graph_id"], attempt=event.attempt)
        record = store.load()
        state = record.state
        assert state["status"] == "completed" and state["root_committed"] is True
        assert not state["active"] and not state["error"]
        ends = [row for row in state["completed"] if row["node_id"] == "end"]
        assert len(ends) == 1
        result = store.read_json(ends[0]["output_ref"])
        assert result == {"message": f"Desktop Workflow Tool root reply {turn}"}
        final = [row for row in events if row.attempt == event.attempt and row.event_type == "final_message"]
        terminal = [row for row in events if row.attempt == event.attempt and row.event_type == "run_completed"]
        assert len(final) == len(terminal) == 1
        assert final[0].store_seq < terminal[0].store_seq
        assert final[0].payload["content"] == result["message"]
        assert not [row for row in events if row.attempt == event.attempt and row.event_type == "run_failed"]
        kernel = [row for row in state["completed"] if row["node_id"] == "kernel"]
        assert len(kernel) == 1
        versions = [row for row in descriptor["workflows"]["workflows"]
            if row["workflow_id"] == tool["workflow"]["workflow_id"]
            and row["revision_id"] == tool["workflow"]["revision_id"]]
        assert len(versions) == 1
        version = versions[0]
        binding = resolve_workflow_tool("tools", tool, lambda wid, rev:
            PublishedWorkflow(wid, rev, version["document"]))
        # This immediate child never parks, so it has no waiting-tool settlement
        # receipt. Verify its actual durable graph and End instead of inventing one.
        identity = json.dumps([kernel[0]["node_attempt_id"], f"workflow-call-{turn}", binding.entry_id],
            ensure_ascii=False, separators=(",", ":"))
        child_run = "workflow-tool." + sha256(identity.encode()).hexdigest()
        suffix = sha256("\0".join((descriptor["graph_id"], child_run, binding.entry_id)).encode()).hexdigest()
        child_store = WorkflowExecutionStore(journal, binding.plan,
            graph_id=f"{descriptor['graph_id']}.subagent.{suffix}",
            attempt=AttemptRef(event.attempt.generation, child_run))
        child_state = child_store.load().state
        assert child_state["status"] == "completed" and not child_state["error"] and not child_state["active"]
        code_rows = [row for row in child_state['completed'] if row['node_id'] == 'step']
        assert len(code_rows) == 1
        raw_code_result = child_store.read_json(code_rows[0]['output_ref'])
        assert raw_code_result['receipt'] == 'raw-code-node-result-not-End'
        child_ends = [row for row in child_state["completed"] if row["node_id"] == "end"]
        assert len(child_ends) == 1
        child_output = child_store.read_json(child_ends[0]["output_ref"])
        assert child_output["receipt"] == "committed-workflow-End-only"
        assert child_output['receipt'] != raw_code_result['receipt'], 'child End must be distinct from raw child node result'
        worker = Path(child_output["interpreter"])
        relative_worker = worker.relative_to(app_root)
        assert str(relative_worker).startswith("resources/mcp_runtime/python/")
        assert sha256(worker.read_bytes()).hexdigest() == expected_files[str(relative_worker)]
        roots.append({"attempt": event.attempt.to_dict(), "final_seq": final[0].store_seq,
            "terminal_seq": terminal[0].store_seq, "state": deepcopy(state), "End": result,
            "child_state": child_state, "child_End": child_output,
            "bundled_worker_sha256": expected_files[str(relative_worker)]})
    (out / "raw-verification.json").write_text(json.dumps({"verdict": "RAW_APP_ENTRY_BOUNDED_AUTH_SCAN_PENDING", "roots": roots,
        "wheel_sha256": os.environ["QA_WHEEL_SHA"], "manifest": os.environ["QA_MANIFEST"],
        "sidecar_sha256": os.environ["QA_BINARY_SHA"], "database_source": str(source),
        "verification_uses_private_checkpointed_copy": True}, indent=2) + "\n")
    expected_resources = {row['resource']['document']['id']: row['resource']['document'] for row in read('lifecycle-seed.json')['resources']}
    verified = []
    for case in lifecycle['cases']:
        assistant = [row for row in case['messages'] if row['role'] == 'assistant']
        assert len(assistant) == 1
        session = assistant[0]['meta']['executionSessionId']
        other = open_existing_execution_journal_readonly(database_path=database,
            object_directory=copied / 'objects', execution_id=session)
        history = other.capture_snapshot().events
        saved_launches = [row for row in history if row.event_type == 'pupu.skeleton.launch']
        assert len(saved_launches) == 1
        event = saved_launches[0]
        payload = _thaw_json(event.payload)
        artifact = ArtifactRef.from_dict(payload['launch_ref'])
        raw = other.read_full_verified(artifact=artifact)
        assert sha256(raw).hexdigest() == payload['launch_sha256']
        descriptor = json.loads(raw); assert canonical(descriptor) == raw
        assert descriptor['runtime_manifest']['manifest_digest'] == os.environ['QA_MANIFEST']
        selected = descriptor['selection']['document']
        assert selected == expected_resources[selected['id']]
        _, _, plan = validate_launch_descriptor(descriptor, session_id=session, root_run_id=event.attempt.attempt_id)
        store = WorkflowExecutionStore(other, plan, graph_id=descriptor['graph_id'], attempt=event.attempt)
        state = store.load().state
        final = [row for row in history if row.attempt == event.attempt and row.event_type == 'final_message']
        terminal = [row for row in history if row.attempt == event.attempt and row.event_type == 'run_completed']
        verified_child = None
        if case['name'] == 'cancelled':
            assert state['status'] == 'cancelled' and state['root_committed'] is False
            assert not final and not terminal and not any(row['node_id'] == 'end' for row in state['completed'])
            assert any(row['type'] == 'interaction_cancelled' for row in assistant[0]['traceFrames'])
        else:
            assert state['status'] == 'completed' and state['root_committed'] is True and not state['error']
            assert not any(row.attempt == event.attempt and row.event_type == 'run_failed' for row in history)
            assert len(final) == len(terminal) == 1 and final[0].store_seq < terminal[0].store_seq
            end = next(row for row in state['completed'] if row['node_id'] == 'end')
            assert store.read_json(end['output_ref']) == {'message': case['expected']}
            assert final[0].payload['content'] == case['expected']
            if case['name'] == 'approved':
                waiting = read('lifecycle-approve-waiting.json')
                canonical_run = event.attempt.attempt_id
                resumed_attempt = assistant[0]['meta'].get('attemptId')
                assert waiting['pending'].get('source_run_id') == canonical_run and canonical_run, \
                    'approved canonical source run must bind to the original launch'
                assert resumed_attempt and resumed_attempt != canonical_run, \
                    'approved resume must use a distinct transport attempt'
                interaction_id = waiting['pending'].get('interaction_id')
                action = read('lifecycle-approval-action.json')
                assert action['interaction_id'] == interaction_id and action['pointer_clicks'] == 1
                assert action['proven_card']['proven_index'] is not None
                assert action['provider_count_after_resume'] == 2
                texts = [row['text'] for row in descriptor['code_sources']['closure']['contents']]
                assert any('lifecycle-source-A' in text for text in texts)
                assert not any('lifecycle-source-B' in text for text in texts)
                parent_kernel = [row for row in state['completed'] if row['node_id'] == 'kernel']
                assert len(parent_kernel) == 1
                parent_attempt = parent_kernel[0]['node_attempt_id']
                tool_nodes = [node for node in selected['nodes'] if node['id'] == 'tools']
                assert len(tool_nodes) == 1
                tool_entries = [entry for entry in tool_nodes[0]['config']['workflow_tools'] if entry.get('id') == 'mutate']
                assert len(tool_entries) == 1
                selected_tool = tool_entries[0]
                versions = [row for row in descriptor['workflows']['workflows']
                    if row['workflow_id'] == selected_tool['workflow']['workflow_id']
                    and row['revision_id'] == selected_tool['workflow']['revision_id']]
                assert len(versions) == 1
                version = versions[0]
                binding = resolve_workflow_tool('tools', selected_tool, lambda wid, rev:
                    PublishedWorkflow(wid, rev, version['document']))
                approval_wires = [row for row in wires if row.get('scenario') == 'lifecycle'
                    and row.get('body', {}).get('model') == 'qa356-approval']
                assert len(approval_wires) == 2
                tool_calls = approval_wires[0]['response']['message']['tool_calls']
                assert len(tool_calls) == 1 and tool_calls[0]['id'] == 'approve-workflow-call'
                assert tool_calls[0]['function']['name'] == 'workflow_mutate'
                arguments = tool_calls[0]['function']['arguments']
                assert arguments['inputs']['path'] == str(out / 'lifecycle-workspace' / 'approve.txt')
                call_id = tool_calls[0]['id']
                call_identity = json.dumps([parent_attempt, call_id, binding.entry_id],
                    ensure_ascii=False, separators=(',', ':'))
                child_attempt = 'workflow-tool.' + sha256(call_identity.encode('utf-8')).hexdigest()
                child_suffix = sha256('\0'.join((descriptor['graph_id'], child_attempt,
                    binding.entry_id)).encode('utf-8', 'surrogatepass')).hexdigest()
                child_graph = f"{descriptor['graph_id']}.subagent.{child_suffix}"
                child_store = WorkflowExecutionStore(other, binding.plan, graph_id=child_graph,
                    attempt=AttemptRef(event.attempt.generation, child_attempt))
                approved_state = child_store.load().state
                assert approved_state['status'] == 'completed' and not approved_state['active'] and not approved_state['error']
                writes = [row for row in approved_state['completed'] if row['node_id'] == 'write']
                codes = [row for row in approved_state['completed'] if row['node_id'] == 'code']
                approved_ends = [row for row in approved_state['completed'] if row['node_id'] == 'end']
                assert len(writes) == len(codes) == len(approved_ends) == 1, \
                    'approved Workflow child must commit exactly one Write, Code and End'
                code_value = child_store.read_json(codes[0]['output_ref'])
                end_value = child_store.read_json(approved_ends[0]['output_ref'])
                assert code_value.get('receipt') == end_value.get('receipt') == 'lifecycle-source-A'
                assert code_value.get('receipt') != 'lifecycle-source-B'
                write_row = writes[0]
                child_events = [row for row in history if row.attempt == AttemptRef(event.attempt.generation, child_graph)]
                requested = [row for row in child_events if row.event_type == 'interaction.requested'
                    and row.payload.get('interaction_id') == interaction_id]
                resolved = [row for row in child_events if row.event_type == 'interaction.resolved'
                    and row.payload.get('interaction_id') == interaction_id]
                assert len(requested) == len(resolved) == 1, \
                    'approved child must persist one request and one resolution for the retained interaction'
                request_payload = _thaw_json(requested[0].payload)['interaction_request']
                subject = request_payload['subject']
                assert subject['graph_id'] == child_graph and subject['node_id'] == 'write'
                assert subject['node_invocation_id'] == write_row['node_invocation_id']
                assert subject['node_attempt_id'] == write_row['node_attempt_id']
                assert subject['tool_name'] == 'write'
                resolution_payload = _thaw_json(resolved[0].payload)
                artifact = ArtifactRef(ResourceRef.from_dict(resolution_payload['content_ref']),
                    'application/json', resolution_payload['content_bytes'],
                    resolution_payload['content_sha256'], resolution_payload.get('preview', ''))
                raw_receipt = other.read_full_verified(artifact=artifact)
                accepted = json.loads(raw_receipt)
                assert type(accepted) is dict and set(accepted) == {'interaction_id', 'response', 'submitted_by'}
                assert accepted['interaction_id'] == interaction_id and accepted['submitted_by'] == 'user'
                assert type(accepted['response']) is dict and accepted['response'].get('approved') is True
                approved_child_evidence = {'graph_id': child_graph, 'attempt_id': child_attempt,
                    'state': approved_state, 'write': write_row, 'code': code_value, 'End': end_value,
                    'interaction_request': request_payload, 'accepted_receipt': accepted,
                    'verified_resolution_artifact': artifact.to_dict()}
            if case['name'] == 'child':
                metadata = assistant[0]['subagentMetaByRunId']
                parent_kernel = next(node for node in selected['nodes'] if node['type'] == 'agent')
                expected_full_id = parent_kernel['id'] + '.reviewer.1'
                lifecycle_children = [(run_id, row) for run_id, row in metadata.items()
                    if row.get('subagentId') == expected_full_id and row.get('template') == 'Reviewer'
                    and row.get('parentId') == parent_kernel['id']
                    and row.get('lineage') == [parent_kernel['id'], expected_full_id]
                    and row.get('mode') == 'delegate' and row.get('status') == 'completed']
                assert len(lifecycle_children) == 1, 'exactly one completed Reviewer lifecycle child is required'
                child_attempt, child_meta = lifecycle_children[0]
                pools = [node for node in selected['nodes'] if node['type'] == 'subagent_pool']
                embedded = [(pool, entry) for pool in pools for entry in pool['config']['subagents']
                            if entry.get('name') == 'Reviewer']
                assert len(embedded) == 1, 'reviewer child source is ambiguous in immutable launch'
                pool, embedded_entry = embedded[0]
                manifest_rows = [row for row in descriptor['selection']['subagents']
                    if row['pool_node_id'] == pool['id'] and row['kernel_node_id'] == parent_kernel['id']
                    and row['entry_id'] == embedded_entry['id']]
                assert len(manifest_rows) == 1, 'reviewer launch manifest entry is ambiguous'
                child_manifest = manifest_rows[0]
                assert child_manifest['document'] == embedded_entry['source']['document']
                assert child_manifest['entry_id'] == 'reviewer'
                child_plan = prepare_agent_graph(child_manifest['document'])
                suffix = sha256('\0'.join((descriptor['graph_id'], child_attempt,
                    child_manifest['entry_id'])).encode('utf-8', 'surrogatepass')).hexdigest()
                child_graph_id = f"{descriptor['graph_id']}.subagent.{suffix}"
                child_store = WorkflowExecutionStore(other, child_plan, graph_id=child_graph_id,
                    attempt=AttemptRef(event.attempt.generation, child_attempt))
                child_state = child_store.load().state
                assert child_state['status'] == 'completed' and not child_state['active'] and not child_state['error']
                child_kernel = [row for row in child_state['completed'] if row['node_id'] == 'kernel']
                child_end = [row for row in child_state['completed'] if row['node_id'] == 'end']
                assert len(child_kernel) == len(child_end) == 1
                raw_child_model = child_store.read_json(child_kernel[0]['output_ref'])
                native_attempt = child_kernel[0].get('node_attempt_id')
                assert native_attempt and native_attempt != child_attempt, \
                    'native response attempt and lifecycle child must differ'
                committed_child_end = child_store.read_json(child_end[0]['output_ref'])
                assert raw_child_model['message'] == lifecycle['childReply']
                assert committed_child_end['message'] == lifecycle['childEnd']
                assert raw_child_model['message'] != committed_child_end['message']
                kernel_events = [row for row in history if row.event_type == 'skeleton.kernel_result.saved'
                    and row.payload.get('graph_id') == child_graph_id]
                assert len(kernel_events) == 1 and kernel_events[0].attempt.attempt_id == native_attempt
                frame_buckets = assistant[0].get('subagentFrames', {})
                native_frames = frame_buckets.get(native_attempt)
                lifecycle_frames = frame_buckets.get(child_attempt)
                assert isinstance(native_frames, list) and native_frames, 'native response frame bucket is missing'
                assert raw_child_model['message'] in json.dumps(native_frames, ensure_ascii=False), \
                    'native response frames do not match the durable child kernel output'
                assert isinstance(lifecycle_frames, list) and lifecycle_frames, 'lifecycle child frame bucket is missing'
                assert lifecycle['childEnd'] in json.dumps(lifecycle_frames, ensure_ascii=False), \
                    'lifecycle child frame bucket does not contain the committed End output'
                parent_requests = [row for row in wires if row.get('body', {}).get('model') == 'qa356-parent']
                assert len(parent_requests) == 2
                assert lifecycle['childEnd'] in json.dumps(parent_requests[1]['body']['messages'])
                verified_child = {'graph_id': child_graph_id, 'attempt_id': child_attempt,
                    'kernel_event': kernel_events[0].to_dict(), 'raw_model_result': raw_child_model,
                    'committed_End': committed_child_end, 'state': child_state}
            else:
                verified_child = approved_child_evidence if case['name'] == 'approved' else None
        verified.append({'case': case['name'], 'session': session, 'state': state,
            'finals': [row.to_dict() for row in final], 'terminals': [row.to_dict() for row in terminal],
            'child_store': verified_child})
        (out / ('lifecycle-' + case['name'] + '-journal.json')).write_text(json.dumps([row.to_dict() for row in history], indent=2) + '\n')
    workspace = out / 'lifecycle-workspace'
    assert sorted(path.name for path in workspace.iterdir()) == ['approve.txt']
    assert (workspace / 'approve.txt').is_file() and not (workspace / 'approve.txt').is_symlink()
    assert (workspace / 'approve.txt').read_bytes() == b'approved-exactly-once'
    (out / 'raw-lifecycle-verification.json').write_text(json.dumps({'verdict': 'RAW_APP_LIFECYCLE_BOUNDED_AUTH_SCAN_PENDING',
        'cases': verified, 'source': 'real immutable launch, native Journal reader, verified CAS and stored UI messages',
        'wheel_sha256': os.environ['QA_WHEEL_SHA'], 'manifest': os.environ['QA_MANIFEST']}, indent=2) + '\n')


if __name__ == "__main__":
    verify_packaged_workflow_tool()
