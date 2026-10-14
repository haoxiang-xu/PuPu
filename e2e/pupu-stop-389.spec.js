/* Isolated #389 acceptance; opt in so the fake provider never affects other runs. */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test, expect } = require("./fixtures/pupu_app");
const { buildCustomProviderDefinition, CUSTOM_MODEL_ID, CUSTOM_PROVIDER_SLUG, buildMcpInstallPayload, MCP_TOOLKIT_ID } = require("../scripts/test-api/deterministic-soak-lib.cjs");
const { buildResponseEnvelope, serializeSse } = require("../scripts/test-api/fixtures/fake_openai_responses_server.js");
const EVIDENCE = process.env.PUPU_STOP389_REPORT_DIR;
test.skip(process.env.PUPU_STOP389_UI !== "1", "isolated #389 opt-in");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const stopPath = 'M6 7V17C6 17.5523 6.44772 18 7 18H17C17.5523 18 18 17.5523 18 17V7C18 6.44772 17.5523 6 17 6H7C6.44772 6 6 6.44772 6 7Z';

test("Stop preserves visible tools and text, rejects late content, and permits a successor", async ({ pupu }, testInfo) => {
  test.setTimeout(240000);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const report = { cells: [], calls: [], pageErrors: [], screenshots: [], status: "running" };
  const { appWindow: page, testApi } = pupu;
  const manualReproDir = path.join(EVIDENCE, "electron-manual-repro");
  fs.mkdirSync(manualReproDir, { recursive: true });
  const debug = async (code) => {
    const result = await testApi.post("/debug/eval", { code, await: true });
    if (!result.ok) throw Error(JSON.stringify(result.error));
    return result.value;
  };
  const screen = async (name) => {
    const file = path.join(EVIDENCE, `${name}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push(file);
  };
  let forceNormal = false;
  let forceWaitTool = false;
  let delayedCancelAckInstalled = false;
  let blockedToolReleaseFile = null;
  let blockedWriterCellActive = false;
  const timers = new Set();
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    if (!request.url.endsWith("/responses")) { response.writeHead(404); response.end(); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const input = JSON.stringify(body.input || []);
    const cases = ["389_NORMAL", "389_APPROVAL", "389_TOOL_APPROVAL", "389_STOP_MODEL", "389_FAIL"];
    const scenario = forceWaitTool ? "389_WAIT_TOOL" : forceNormal ? "389_NORMAL" : cases.sort((a,b) => input.lastIndexOf(b)-input.lastIndexOf(a))[0];
    report.calls.push({ scenario, stream: body.stream, at: Date.now() });
    if (scenario === "389_FAIL") { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({error:{message:"fixture failure",type:"invalid_request_error"}})); return; }
    const envelope = buildResponseEnvelope({ ...body, input: [{ role:"user", content: scenario === "389_APPROVAL" ? "SOAK_CHILD|scenario=question|lane=A|target=soak-explore-a" : scenario === "389_TOOL_APPROVAL" ? "SOAK|lane=A|phase=gate|iteration=1" : scenario === "389_WAIT_TOOL" ? "SOAK|lane=A|phase=wait|iteration=0" : "finish" }] });
    if (!body.stream) { response.writeHead(200,{"content-type":"application/json"}); response.end(JSON.stringify(envelope.response)); return; }
    response.writeHead(200,{"content-type":"text/event-stream"});
    if (scenario === "389_STOP_MODEL") {
      response.write(serializeSse(envelope.events.slice(0,5)).replace("data: [DONE]\n\n", ""));
      const timer = setTimeout(() => {
        timers.delete(timer);
        report.lateProviderDelivery={timerFired:true,socketDestroyed:response.destroyed};
        if (!response.destroyed) {
          response.write(serializeSse([{...envelope.events[4], delta:"LATE_389_REJECT", sequence_number: 5}]));
          response.end(serializeSse(envelope.events.slice(5)));
        }
      }, 6000); timers.add(timer);
    } else response.end(serializeSse(envelope.events));
  });
  await new Promise((resolve) => server.listen(0,"127.0.0.1",resolve));
  try {
    const probe = spawnSync(process.env.UNCHAIN_PYTHON_BIN,["-c",'import os,sys,json,pathlib; sys.path.insert(0,os.path.join(os.environ["UNCHAIN_SOURCE_PATH"],"src")); import unchain; from unchain.runtime.runtime_protocol import runtime_protocol_manifest; print(json.dumps({"path":str(pathlib.Path(unchain.__file__).resolve()),"manifest":runtime_protocol_manifest()["manifest_digest"]}))'],{encoding:"utf8",env:process.env});
    expect(probe.status,probe.stderr).toBe(0); report.artifact = JSON.parse(probe.stdout.trim());
    expect(report.artifact.path).toContain(`/${process.env.PUPU_STOP389_PACKAGE_FOLDER || "verified-runtime"}/unchain/`);
    expect(report.artifact.manifest).toBe("sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f");
    const enter = async () => {
      const gate=page.getByRole("button",{name:"Click anywhere to start"});
      await expect(gate).toBeVisible({timeout:90000}); await gate.click();
      const skip=page.getByRole("button",{name:"Skip for now",exact:true});
      if (await skip.isVisible()) { await skip.click(); await expect(page.getByRole("dialog").filter({has:skip})).toBeHidden(); }
    };
    await enter();
    const definition = buildCustomProviderDefinition(`http://127.0.0.1:${server.address().port}/v1`);
    await debug(`const storage=window.settingsStorageAPI; const before=storage.bootstrap().namespaces||{}; await storage.setNamespace("feature_flags",{format:2,flags:{...(before.feature_flags?.flags||{}),enable_custom_model_providers:true}}); await storage.setNamespace("model_providers",{...(before.model_providers||{}),custom_providers:[${JSON.stringify(definition)}]}); await storage.setNamespace("memory",{...(before.memory||{}),enabled:true,long_term_enabled:false}); await storage.setProviderCredential("custom_provider",${JSON.stringify(`custom.${CUSTOM_PROVIDER_SLUG}`)},"pupu-fixture-key"); return {ok:true};`);
    await page.reload(); await enter();
    const status=await debug("return window.unchainAPI.getStatus()"); report.runtimeStatus=status; expect(status.ready).toBe(true); expect(status.memoryV2.runtimeProtocolDigest).toBe(report.artifact.manifest);
    const mcpWorkspace=path.join(EVIDENCE,"mcp-workspace");fs.mkdirSync(mcpWorkspace,{recursive:true});
    const auditFile=path.join(EVIDENCE,"mcp-audit.jsonl");
    const mcpPayload=buildMcpInstallPayload({pythonPath:process.env.UNCHAIN_PYTHON_BIN,fixturePath:path.resolve(__dirname,"../scripts/test-api/fixtures/deterministic_mcp_server.py"),workspaceRoot:mcpWorkspace,auditPath:path.join(EVIDENCE,"mcp-audit.jsonl"),timeScale:0.1});
    // These fixture controls are paths/numbers, not credentials. Keep this
    // isolated test independent of macOS keychain availability.
    const mcpWrapper=path.join(EVIDENCE,"mcp-fixture.py");
    const blockedToolStartedFile=path.join(mcpWorkspace,"stop389-soak-wait-started.json");
    blockedToolReleaseFile=path.join(mcpWorkspace,"stop389-soak-wait-release.json");
    fs.writeFileSync(mcpWrapper,`import os, runpy, time\nos.environ["PUPU_SOAK_AUDIT_PATH"] = ${JSON.stringify(path.join(EVIDENCE,"mcp-audit.jsonl"))}\nos.environ["PUPU_SOAK_TIME_SCALE"] = "0.1"\nfixture = runpy.run_path(${JSON.stringify(path.resolve(__dirname,"../scripts/test-api/fixtures/deterministic_mcp_server.py"))}, run_name="pupu_stop389_mcp_fixture")\nmcp = fixture["mcp"]\nstarted_path = ${JSON.stringify(blockedToolStartedFile)}\nrelease_path = ${JSON.stringify(blockedToolReleaseFile)}\nasync def blocked_soak_wait(lane, milliseconds=fixture["WAIT_MILLISECONDS"], marker=fixture["MARKER"]):\n    args = {"lane": lane, "milliseconds": milliseconds, "marker": marker}\n    call_ordinal, tool_ordinal = fixture["_reserve_call"]("soak_wait", lane)\n    detail = {"fixture_hold": True, "release_file": release_path}\n    fixture["_write_audit"](tool="soak_wait", lane=lane, args=args, call_ordinal=call_ordinal, tool_ordinal=tool_ordinal, status="started", detail=detail)\n    with open(started_path, "w", encoding="utf-8") as handle:\n        handle.write(str(os.getpid()))\n    deadline = time.monotonic() + 25\n    while not os.path.exists(release_path) and time.monotonic() < deadline:\n        time.sleep(0.05)\n    status = "ok" if os.path.exists(release_path) else "timeout"\n    fixture["_write_audit"](tool="soak_wait", lane=lane, args=args, call_ordinal=call_ordinal, tool_ordinal=tool_ordinal, status=status, detail=detail)\n    return fixture["_canonical_result"](tool="soak_wait", lane=lane, args=args, call_ordinal=call_ordinal, tool_ordinal=tool_ordinal, status=status, fixture_hold=True)\nmcp._tool_manager._tools["soak_wait"].fn = blocked_soak_wait\nmcp.run(transport="stdio")\n`);
    mcpPayload.secrets={}; mcpPayload.customRecipe.secrets=[]; mcpPayload.customRecipe.mcp.args=[mcpWrapper];
    report.mcpInstall=await debug(`return window.unchainAPI.installMcpToolkit(${JSON.stringify(mcpPayload)})`);
    expect(report.mcpInstall.toolkit?.toolkitId).toBe(MCP_TOOLKIT_ID);

    let chatId;
    const newChat = async (label) => { const created = await testApi.post("/chats",{title:`#389 ${label}`,model:CUSTOM_MODEL_ID}); chatId=created.chat_id; (report.chatIds ||= []).push(chatId); };
    const detail=()=>testApi.get(`/chats/${chatId}`);
    const start=async(text)=>testApi.post(`/chats/${chatId}/runs`,{text});
    const waitDone=async()=>expect.poll(async()=> (await detail()).messages?.filter(m=>m.role==="assistant").at(-1)?.status,{timeout:20000}).toBe("done");
    const stop=async(label)=>{
      const button=page.locator(`button:has(path[d="${stopPath}"])`).first(); await expect(button).toBeVisible(); const at=Date.now(); await button.click(); await expect(button).toBeHidden({timeout:1500}); report.cells.push({name:label,status:"PASS",uiStopMs:Date.now()-at});
    };
    const installDelayedCancelAck = async ({ delayMs = 1250 } = {}) => {
      await debug(`
        /* Electron's contextBridge facade is intentionally frozen. Resolve
           only the already-loaded renderer API module by its exact source
           module id, then wrap its mutable domain bridge before it forwards
           to the contextBridge method. Do not inspect or require unrelated
           webpack modules. */
        const chunkGlobals = Object.keys(window).filter(name => /^webpackChunkPuPu$/i.test(name) && Array.isArray(window[name]));
        if (chunkGlobals.length !== 1) throw new Error("Expected the PuPu renderer webpack chunk global");
        let webpackRequire = null;
        const probeChunkId = "pupu_stop389_api_probe_" + Date.now();
        window[chunkGlobals[0]].push([[probeChunkId], {}, runtime => { webpackRequire = runtime; }]);
        if (typeof webpackRequire !== "function" || typeof webpackRequire.m?.["./src/SERVICEs/api.js"] !== "function") {
          throw new Error("Exact PuPu renderer API module factory is unavailable");
        }
        const rendererApi = webpackRequire("./src/SERVICEs/api.js")?.api;
        const unchain = rendererApi?.unchain;
        if (!unchain || typeof unchain.cancelExecution !== "function" || Object.isFrozen(unchain)) {
          throw new Error("The exact renderer API module does not expose a mutable Unchain cancelExecution method");
        }
        const original = unchain.cancelExecution;
        const state = { calls: 0, startedAt: null, backendAckAt: null, rendererAckAt: null, delayMs: ${delayMs}, webpackGlobal: chunkGlobals[0], moduleId: "./src/SERVICEs/api.js" };
        window.__pupu389DelayedCancelAck = { state, original, unchain };
        unchain.cancelExecution = async function(payload) {
          state.calls += 1;
          state.startedAt ||= Date.now();
          const pendingResponse = Promise.resolve(original.call(this, payload));
          const response = await pendingResponse;
          state.backendAckAt = Date.now();
          await new Promise(resolve => setTimeout(resolve, state.delayMs));
          state.rendererAckAt = Date.now();
          return response;
        };
        return true;
      `);
      delayedCancelAckInstalled = true;
    };
    const cancelAckState = () => debug("return window.__pupu389DelayedCancelAck?.state || null");
    const restoreCancelExecution = async () => {
      if (!delayedCancelAckInstalled) return;
      await debug("const wrapped = window.__pupu389DelayedCancelAck; if (wrapped) wrapped.unchain.cancelExecution = wrapped.original; delete window.__pupu389DelayedCancelAck; return true;");
      delayedCancelAckInstalled = false;
    };
    const stopAndWaitForDelayedAck = async () => {
      const button=page.locator(`button:has(path[d="${stopPath}"])`).first();
      await expect(button).toBeVisible();
      await button.click();
      await expect.poll(async()=> (await cancelAckState())?.startedAt, {timeout:5000}).toBeTruthy();
    };
    const cell=async(name,fn)=>{ try {await fn(); report.cells.push({name,status:"PASS"});} catch(e) {if(blockedWriterCellActive&&blockedToolReleaseFile&&!fs.existsSync(blockedToolReleaseFile)) fs.writeFileSync(blockedToolReleaseFile,JSON.stringify({releasedAt:Date.now(),cleanup:true})); forceNormal=false; forceWaitTool=false; report.cells.push({name,status:"FAIL",error:e.message}); await screen(name.replace(/[^a-z0-9]/gi,"-")).catch(()=>{});} };
    const resend=async()=>{
      const text=(await detail()).messages.filter(m=>m.role==="user").at(-1).content;
      await page.getByText(text,{exact:true}).hover({timeout:5000});
      const count=report.calls.length; forceNormal=true;
      try {await expect(page.locator('button[title="Resend"]').last()).toBeEnabled(); await page.locator('button[title="Resend"]').last().dispatchEvent("click"); await expect.poll(()=>report.calls.length,{timeout:12000}).toBeGreaterThan(count); await waitDone();} finally {forceNormal=false;}
    };
    await newChat("normal"); await start("389_NORMAL first"); await waitDone(); await start("389_NORMAL second"); await waitDone(); report.cells.push({name:"first and second normal messages",status:"PASS"});
    await newChat("interaction Stop"); await start("389_APPROVAL pending tool");
    await expect(page.getByText("Deterministic child clarification",{exact:false}).first()).toBeVisible({timeout:20000});
    await screen("389-before-stop-tool"); await stop("Stop awaiting user interaction"); await screen("389-after-stop-tool");
    const afterTool=await detail(); report.toolHistory=afterTool; expect(afterTool.messages.filter(m=>(m.traceFrames||[]).some(f=>f.type==="tool_call")).length).toBeGreaterThan(0);
    await cell("resend after stopped interaction",resend);
    await newChat("true tool approval Stop");
    await testApi.post(`/chats/${chatId}/toolkits`,{toolkit_ids:[MCP_TOOLKIT_ID]});
    const approvalAttempt=await start("389_TOOL_APPROVAL pending destructive fixture");
    await expect.poll(async()=> (await debug(`return window.unchainAPI.getPendingInteraction({session_id:${JSON.stringify(approvalAttempt.execution_id)}})`)).status,{timeout:20000}).toBe("awaiting_response");
    report.pendingApproval=await debug(`return window.unchainAPI.getPendingInteraction({session_id:${JSON.stringify(approvalAttempt.execution_id)}})`);
    expect(report.pendingApproval.kind).toBe("tool_approval");
    await cell("real pending producer is accepted by both strict renderer consumers",async()=>{
      const producerConsumers=await debug(`
        const chunkGlobals=Object.keys(window).filter(name=>/^webpackChunkPuPu$/i.test(name)&&Array.isArray(window[name]));
        if(chunkGlobals.length!==1) throw new Error("Expected the exact PuPu renderer webpack chunk global");
        let runtimeRequire=null;
        const probeChunkId="pupu_stop389_producer_probe_"+Date.now();
        window[chunkGlobals[0]].push([[probeChunkId],{},runtime=>{runtimeRequire=runtime;}]);
        const apiModuleId="./src/SERVICEs/api.js";
        const recoveryModuleId="./src/PAGEs/chat/hooks/durable_interaction_recovery.js";
        if(typeof runtimeRequire!=="function"||typeof runtimeRequire.m?.[apiModuleId]!=="function"||typeof runtimeRequire.m?.[recoveryModuleId]!=="function") {
          throw new Error("Expected both exact renderer module factories");
        }
        const rendererApi=runtimeRequire(apiModuleId)?.api;
        const recovery=runtimeRequire(recoveryModuleId);
        const expectedSessionId=${JSON.stringify(approvalAttempt.execution_id)};
        const raw=await window.unchainAPI.getPendingInteraction({session_id:expectedSessionId});
        let apiResult=null;
        let apiError=null;
        try { apiResult=await rendererApi.unchain.getPendingInteraction({session_id:expectedSessionId}); }
        catch(error) { apiError={code:error?.code||"",message:String(error?.message||error)}; }
        const normalized=recovery.normalizePendingInteraction(raw,expectedSessionId);
        const describe=(value)=>{
          const type=value===null?"null":Array.isArray(value)?"array":typeof value;
          const objectLike=value!==null&&typeof value==="object";
          const keys=objectLike?Object.keys(value).sort():[];
          return {type,keys,fieldTypes:objectLike?Object.fromEntries(keys.map(key=>[key,value[key]===null?"null":Array.isArray(value[key])?"array":typeof value[key]])): {}};
        };
        const toolCall=raw?.presentation?.tool_call||{};
        const traceFrame=raw?.presentation?.trace_frame||{};
        const tracePayload=traceFrame.payload||{};
        const rawArguments=toolCall.arguments;
        let parsedArguments=null;
        let argumentsJsonParse="not_applicable";
        if(typeof rawArguments==="string") {
          try { parsedArguments=JSON.parse(rawArguments); argumentsJsonParse="parsed"; }
          catch(_) { argumentsJsonParse="invalid_json"; }
        }
        const argumentShape=describe(parsedArguments===null?rawArguments:parsedArguments);
        return {
          webpackGlobal:chunkGlobals[0],
          apiModuleId,
          recoveryModuleId,
          expectedSessionId,
          producer:{
            topLevel:describe(raw),
            lineage:{
              status:raw?.status,
              kind:raw?.kind,
              sessionId:raw?.session_id,
              interactionId:raw?.interaction_id,
              sourceRunId:raw?.source_run_id,
              activeAttemptId:raw?.active_attempt_id,
              traceRunId:traceFrame.run_id,
              callId:toolCall.call_id,
              traceCallId:tracePayload.call_id,
              toolName:toolCall.tool_name,
              confirmationId:toolCall.confirmation_id,
              lineageMatches:raw?.session_id===expectedSessionId&&raw?.source_run_id===raw?.active_attempt_id&&traceFrame.run_id===raw?.source_run_id&&toolCall.call_id===tracePayload.call_id&&toolCall.confirmation_id===raw?.interaction_id,
            },
            presentation:describe(raw?.presentation),
            toolCall:describe(toolCall),
            arguments:{...argumentShape,jsonParse:argumentsJsonParse},
            callRef:describe(toolCall.call_ref),
            callRefMetadata:describe(toolCall.call_ref_metadata),
            timelineMergePolicy:describe(toolCall.timeline_merge_policy),
            traceFrame:describe(traceFrame),
            traceIteration:describe(traceFrame.iteration),
            tracePayload:describe(tracePayload),
            tracePayloadCallRef:describe(tracePayload.call_ref),
            tracePayloadCallRefMetadata:describe(tracePayload.call_ref_metadata),
            tracePayloadTimelineMergePolicy:describe(tracePayload.timeline_merge_policy),
          },
          strictApi:{status:apiResult?.status||null,sessionId:apiResult?.session_id||null,kind:apiResult?.kind||null,error:apiError},
          recoveryNormalized:normalized?{status:normalized.status,sessionId:normalized.sessionId,interactionId:normalized.interactionId,kind:normalized.kind,sourceRunId:normalized.sourceRunId,activeAttemptId:normalized.activeAttemptId,callId:normalized.callId}:null,
        };
      `);
      report.pendingProducerStrictConsumers=producerConsumers;
      expect(producerConsumers.producer.lineage.lineageMatches).toBe(true);
      expect(producerConsumers.producer.lineage.status).toBe("awaiting_response");
      expect(producerConsumers.producer.lineage.kind).toBe("tool_approval");
      expect(producerConsumers.strictApi.error).toBeNull();
      expect(producerConsumers.strictApi.status).toBe("awaiting_response");
      expect(producerConsumers.recoveryNormalized).not.toBeNull();
      expect(producerConsumers.recoveryNormalized.status).toBe("awaiting_response");
      expect(producerConsumers.recoveryNormalized.sourceRunId).toBe(producerConsumers.producer.lineage.sourceRunId);
    });
    await screen("389-before-stop-approval"); await stop("Stop awaiting true tool approval"); await screen("389-after-stop-approval");
    await cell("resend after stopped true tool approval",resend);

    // Keep the real IPC cancellation producer and backend response. Hold only
    // the renderer Promise after the backend has acknowledged cancellation;
    // this proves that acknowledgement delivery does not gate the successor.
    await cell("successor is saved and completes before delayed renderer cancel acknowledgement",async()=>{
      await newChat("immediate send while Stop ack is delayed");
      await testApi.post(`/chats/${chatId}/toolkits`,{toolkit_ids:[MCP_TOOLKIT_ID]});
      const immediateStopAttempt=await start("389_TOOL_APPROVAL pending before immediate send");
      await expect.poll(async()=> (await debug(`return window.unchainAPI.getPendingInteraction({session_id:${JSON.stringify(immediateStopAttempt.execution_id)}})`)).status,{timeout:20000}).toBe("awaiting_response");
      await installDelayedCancelAck({delayMs:4000});
      const providerCallsBeforeImmediateSend=report.calls.length;
      try {
        await stopAndWaitForDelayedAck();
        const immediateStopButton=page.locator(`button:has(path[d="${stopPath}"])`).first();
        await expect(immediateStopButton).toBeHidden({timeout:500});
        const immediateComposer=page.locator("textarea").first();
        const immediateSuccessor="389_WAITING_SEND ordinary follow-up";
        await immediateComposer.fill(immediateSuccessor);
        forceNormal=true;
        await immediateComposer.press("Enter");
        await expect.poll(async()=> (await detail()).messages.some(message=>message.role==="user"&&message.content===immediateSuccessor),{timeout:5000}).toBe(true);
        await expect(immediateComposer).toHaveValue("");
        await expect(page.getByText(immediateSuccessor,{exact:true})).toBeVisible();
        await expect.poll(()=>report.calls.length,{timeout:8000}).toBeGreaterThanOrEqual(providerCallsBeforeImmediateSend+1);
        await waitDone();
        const completionBeforeRendererAck=Date.now();
        const ackBeforeRendererDelivery=await cancelAckState();
        expect(ackBeforeRendererDelivery.backendAckAt).toBeTruthy();
        expect(ackBeforeRendererDelivery.rendererAckAt).toBeNull();
        report.immediateSendWhileStopWait={
          successorVisible:true,
          successorSaved:true,
          composerCleared:true,
          successorCompletedBeforeRendererAck:true,
          providerCallsBefore:providerCallsBeforeImmediateSend,
          providerCallsDuringWait:report.calls.length,
          cancelAck:ackBeforeRendererDelivery,
          completionBeforeRendererAck,
        };
        await expect.poll(async()=> (await cancelAckState())?.rendererAckAt,{timeout:10000}).toBeTruthy();
        await pause(350);
        expect(report.calls.length).toBe(providerCallsBeforeImmediateSend+1);
        report.immediateSendWhileStopWait.providerCallsAfterSettlement=report.calls.length;
        report.immediateSendWhileStopWait.finalCancelAck=await cancelAckState();
        expect(report.immediateSendWhileStopWait.finalCancelAck.rendererAckAt-report.immediateSendWhileStopWait.finalCancelAck.backendAckAt).toBeGreaterThanOrEqual(1200);
      } finally {
        forceNormal=false;
        await expect.poll(async()=> (await cancelAckState())?.rendererAckAt,{timeout:10000}).toBeTruthy().catch(()=>{});
        await restoreCancelExecution();
      }
    });

    // A composer draft entered while the same real cancellation is pending
    // must survive settlement and remain unsent.
    await newChat("draft while Stop ack is delayed");
    await testApi.post(`/chats/${chatId}/toolkits`,{toolkit_ids:[MCP_TOOLKIT_ID]});
    const draftStopAttempt=await start("389_TOOL_APPROVAL pending before draft");
    await expect.poll(async()=> (await debug(`return window.unchainAPI.getPendingInteraction({session_id:${JSON.stringify(draftStopAttempt.execution_id)}})`)).status,{timeout:20000}).toBe("awaiting_response");
    await installDelayedCancelAck();
    const providerCallsBeforeDraft=report.calls.length;
    await stopAndWaitForDelayedAck();
    const draftComposer=page.locator("textarea").first();
    const preservedDraft="389_WAITING_DRAFT keep this unsent";
    await draftComposer.fill(preservedDraft);
    await expect.poll(async()=> (await cancelAckState())?.backendAckAt,{timeout:10000}).toBeTruthy();
    await expect.poll(async()=> (await cancelAckState())?.rendererAckAt,{timeout:10000}).toBeTruthy();
    await expect(draftComposer).toHaveValue(preservedDraft);
    await pause(350);
    expect(report.calls.length).toBe(providerCallsBeforeDraft);
    expect(await draftComposer.inputValue()).toBe(preservedDraft);
    report.draftWhileStopWait={
      draft:preservedDraft,
      providerCallsBefore:providerCallsBeforeDraft,
      providerCallsAfterSettlement:report.calls.length,
      cancelAck:await cancelAckState(),
    };
    expect(report.draftWhileStopWait.cancelAck.rendererAckAt-report.draftWhileStopWait.cancelAck.backendAckAt).toBeGreaterThanOrEqual(1200);
    forceNormal=false;
    await restoreCancelExecution();
    report.cells.push({name:"draft survives Stop settlement without sending",status:"PASS"});

    // Run the real deterministic MCP wait tool, but wrap this isolated child
    // process so it blocks synchronously until a fixture-owned release file is
    // written. The provider, IPC, router, MCP protocol and backend writer stay
    // real; only this local fixture tool's duration is controlled by the test.
    blockedWriterCellActive=true;
    await cell("Stop while waiting cancels the saved successor before a live MCP writer settles",async()=>{
      await newChat("Stop a successor while live MCP writer is blocked");
      await testApi.post(`/chats/${chatId}/toolkits`,{toolkit_ids:[MCP_TOOLKIT_ID]});
      const callsBeforeBlockedWriter=report.calls.length;
      forceWaitTool=true;
      try {
        await start("389_WAIT_TOOL block one MCP writer");
        await expect.poll(()=>report.calls.some(call=>call.scenario==="389_WAIT_TOOL"),{timeout:15000}).toBe(true);
      } finally {
        forceWaitTool=false;
      }
      await expect.poll(()=>fs.existsSync(blockedToolStartedFile),{timeout:20000}).toBe(true);
      const blockedWriterAudit=()=>fs.existsSync(auditFile)?fs.readFileSync(auditFile,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)):[ ];
      await expect.poll(()=>blockedWriterAudit().some(entry=>entry.tool==="soak_wait"&&entry.status==="started"&&entry.detail?.fixture_hold===true),{timeout:5000}).toBe(true);
      expect(report.calls.length).toBe(callsBeforeBlockedWriter+1);
      const successor="389_WAITING_STOP stop before writer release";
      const writerStopButton=page.locator(`button:has(path[d="${stopPath}"])`).first();
      await expect(writerStopButton).toBeVisible();
      await writerStopButton.click();
      await expect(writerStopButton).toBeHidden({timeout:500});
      const writerComposer=page.locator("textarea").first();
      forceNormal=true;
      await writerComposer.fill(successor);
      await writerComposer.press("Enter");
      await expect.poll(async()=> (await detail()).messages.some(message=>message.role==="user"&&message.content===successor),{timeout:5000}).toBe(true);
      await expect(writerComposer).toHaveValue("");
      await expect(page.getByText(successor,{exact:true})).toBeVisible();
      await expect(page.getByText("Waiting for the previous run to finish…",{exact:true})).toBeVisible({timeout:5000});
      expect(report.calls.length).toBe(callsBeforeBlockedWriter+1);
      const stopWaitingButton=page.locator(`button:has(path[d="${stopPath}"])`).first();
      await expect(stopWaitingButton).toBeVisible();
      await stopWaitingButton.click();
      await expect(stopWaitingButton).toBeHidden({timeout:500});
      await expect(page.getByText("Waiting for the previous run to finish…",{exact:true})).toBeHidden({timeout:3000});
      await expect(writerComposer).toBeEnabled();
      await expect.poll(async()=> (await detail()).messages.some(message=>message.role==="user"&&message.content===successor),{timeout:3000}).toBe(true);
      report.waitingSuccessorStop={
        blockedWriterStarted:true,
        messageSavedBeforeStop:true,
        waitingVisibleBeforeStop:true,
        composerReadyAfterStop:true,
        providerCallsBefore:callsBeforeBlockedWriter,
      };
      try {
        fs.writeFileSync(blockedToolReleaseFile,JSON.stringify({releasedAt:Date.now()}));
        await expect.poll(()=>blockedWriterAudit().some(entry=>entry.tool==="soak_wait"&&entry.status==="ok"&&entry.detail?.fixture_hold===true),{timeout:15000}).toBe(true);
        await expect.poll(async()=> (await testApi.get("/debug/state")).is_streaming,{timeout:15000}).toBe(false);
        await pause(2200);
        expect(report.calls.length).toBe(callsBeforeBlockedWriter+1);
        report.waitingSuccessorStop.providerCallsAfterWriterSettled=report.calls.length;
        report.waitingSuccessorStop.writerAudit=blockedWriterAudit().filter(entry=>entry.tool==="soak_wait");
      } finally {
        forceNormal=false;
        if(!fs.existsSync(blockedToolReleaseFile)) fs.writeFileSync(blockedToolReleaseFile,JSON.stringify({releasedAt:Date.now(),cleanup:true}));
      }
    });
    blockedWriterCellActive=false;

    await newChat("model Stop"); await start("389_STOP_MODEL stream then Stop"); await expect.poll(()=>report.calls.filter(call=>call.scenario==="389_STOP_MODEL").length).toBeGreaterThan(0);
    await stop("Stop during model response"); await screen("389-after-stop-model");
    await start("389_NORMAL successor after Stop");
    const waiting=page.getByText("Waiting for the previous run to finish…",{exact:true});
    if (await waiting.isVisible().catch(()=>false)) { await screen("389-successor-waiting"); await stop("Stop successor while waiting"); }
    else report.cells.push({name:"successor waiting cancellation",status:"NOT_RUN",reason:"settlement finished before observable wait"});
    await pause(6500); expect(JSON.stringify((await detail()).messages)).not.toContain("LATE_389_REJECT"); report.cells.push({name:"late content after Stop rejected",status:"PASS"});
    const callsBeforeReopen=report.calls.length;
    await page.reload(); await enter(); await expect.poll(async()=> (await testApi.get("/debug/state")).is_streaming).toBe(false); await pause(350); expect(report.calls.length).toBe(callsBeforeReopen); report.cells.push({name:"reopen after Stop without automatic rerun",status:"PASS"});
    await cell("resend after model Stop and reopen",resend);
    await newChat("provider failure"); await start("389_FAIL provider rejection"); await expect.poll(async()=> (await detail()).messages.filter(m=>m.role==="assistant").at(-1)?.status,{timeout:20000}).toBe("error"); report.cells.push({name:"provider failure",status:"PASS"});
    await cell("resend after provider failure",resend);
    report.mcpAudit=fs.existsSync(auditFile)?fs.readFileSync(auditFile,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)):[];
    expect(report.mcpAudit.filter(entry=>entry.tool==="soak_gate"&&entry.status==="ok")).toEqual([]);
    report.finalMessages=await detail(); await screen("389-final"); report.status=report.cells.some(c=>c.status==="FAIL")?"failed":"passed";
    expect(report.cells.filter(c=>c.status==="FAIL")).toEqual([]);
  } catch(error) { report.status="failed"; report.error=error.stack; await screen("389-failure").catch(()=>{}); throw error; }
  finally {
    if(delayedCancelAckInstalled) {
      await debug("window.__pupu389DelayedCancelAck?.release?.(); return true;").catch(()=>{});
      await debug("const wrapped = window.__pupu389DelayedCancelAck; if (wrapped) wrapped.unchain.cancelExecution = wrapped.original; delete window.__pupu389DelayedCancelAck; return true;").catch(()=>{});
      delayedCancelAckInstalled=false;
    }
    const db=path.join(pupu.userDataDir,"memory_v2","context_v2.sqlite3");
    if(fs.existsSync(db)) spawnSync(process.env.UNCHAIN_PYTHON_BIN,["-c", "import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",db,path.join(EVIDENCE,"electron-context-v2.sqlite3")],{encoding:"utf8"});
    for(const directory of ["executions","session_execution_guards"]) { const source=path.join(pupu.userDataDir,directory); if(fs.existsSync(source)) fs.cpSync(source,path.join(EVIDENCE,directory),{recursive:true}); }
    report.pageErrors=[...pupu.pageErrors]; fs.writeFileSync(path.join(EVIDENCE,"electron-report.json"),JSON.stringify(report,null,2)); fs.writeFileSync(path.join(manualReproDir,"stop-immediate-send-evidence.json"),JSON.stringify({immediateSendWhileStopWait:report.immediateSendWhileStopWait||null,draftWhileStopWait:report.draftWhileStopWait||null,waitingSuccessorStop:report.waitingSuccessorStop||null,cells:report.cells.filter(cell=>cell.name.includes("renderer cancel acknowledgement")||cell.name.includes("draft survives Stop")||cell.name.includes("Stop while waiting"))},null,2)); fs.writeFileSync(path.join(manualReproDir,"producer-strict-consumer-evidence.json"),JSON.stringify(report.pendingProducerStrictConsumers||null,null,2)); fs.writeFileSync(path.join(EVIDENCE,"electron-process.log"),pupu.processLogs.join(""));
    for(const timer of timers) clearTimeout(timer); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  }
});
