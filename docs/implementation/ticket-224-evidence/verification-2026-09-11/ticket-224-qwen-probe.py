import dataclasses
import json
import pathlib
import time
import traceback

import unchain
from unchain.agent import Agent, ToolsModule
from unchain.toolkits.builtin.core.core import CoreToolkit

out = pathlib.Path('/private/tmp/ticket-224-live-qwen')
out.mkdir(exist_ok=True)
workspace = out / 'workspace'
workspace.mkdir(exist_ok=True)
prompts = [
    '帮我做一个简单的 todo app',
    '帮我做一个 todo app，放到我电脑上的一个文件夹里',
    '我要你在我电脑上创建一个项目。动手之前，先问我具体要放在哪个文件夹路径。',
]
for index, prompt in enumerate(prompts, 1):
    events = []
    core = CoreToolkit(workspace_root=workspace)
    started = time.time()
    record = {'prompt': prompt, 'model': 'qwen3:32b', 'runtime': unchain.__file__,
              'instructions': '', 'workspace': str(workspace),
              'payload': {'temperature': 0, 'num_ctx': 16384, 'num_predict': 4096},
              'confirmation_policy': 'deny external effects', 'events': events}
    def collect(event):
        events.append(event)
        with (out / f'run-{index}-events.jsonl').open('a') as handle:
            handle.write(json.dumps(event, ensure_ascii=False, default=str) + '\n')
    try:
        agent = Agent(name='ticket-224-qwen', provider='ollama', model='qwen3:32b',
                      modules=(ToolsModule(tools=(core,)),))
        result = agent.run(prompt, payload=record['payload'], max_iterations=3,
                           callback=collect, on_tool_confirm=lambda *_args, **_kwargs: False,
                           session_id=f'ticket-224-qwen-{index}')
        record['result'] = dataclasses.asdict(result)
        print(index, result.status, result.human_input_request, flush=True)
    except Exception:
        record['error'] = traceback.format_exc()
        print(index, record['error'], flush=True)
    finally:
        record['elapsed_seconds'] = time.time() - started
        (out / f'run-{index}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2, default=str))
        core.shutdown()
