# import --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- import #
import json
import httpx
from IPython.display import clear_output

# { import modules for built-in caluclation tool for LLMs }
from sympy.parsing.latex import parse_latex
from sympy import (
    symbols, Eq, Equality, Integral, Derivative, Limit,
    Sum, Product, simplify, solveset, solve
)
from sympy.core.expr import Expr
from sympy.core.relational import Relational
from sympy.matrices.matrices import MatrixBase

# { import modules for llm API calls }
from openai import OpenAI
# import ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- #

# built-in tools ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- built-in tools #
# { built-in LaTeX }
def latex_calculator(latex_string, prefer_symbol=None):
    def latex_format_checker(latex_string):
        try:
            _ = parse_latex(f"{latex_string}")
            return "valid"
        except Exception as error:
            return error
    def normalize_latex(s: str) -> str:
        s = s.strip()
        # 去外层数学定界符
        if s.startswith('$') and s.endswith('$'):
            s = s[1:-1].strip()
        elif s.startswith(r'\(') and s.endswith(r'\)'):
            s = s[2:-2].strip()
        elif s.startswith(r'\[') and s.endswith(r'\]'):
            s = s[2:-2].strip()
        # 常见千分位清理（如 299{,}792）
        s = s.replace('{,}', '').replace(',', '')
        return s
    def solve_from_latex(latex_str: str, prefer_symbol=None):
        """
        根据 LaTeX 字符串的结构自动选择合适的求解方式。
        返回 dict：{ action, expr, result, note }
        """
        raw = normalize_latex(latex_str)
        expr = parse_latex(raw)

        # 1) 矩阵/向量
        if isinstance(expr, MatrixBase):
            return {
                "action": "matrix",
                "expr": expr,
                "result": {
                    "shape": expr.shape,
                    "det": getattr(expr, "det", lambda: None)(),
                    "rank": getattr(expr, "rank", lambda: None)(),
                },
                "note": "矩阵对象，可按需做 det/rank/eigenvals 等"
            }

        # 2) 极限 / 积分 / 导数（显式算子）
        if isinstance(expr, Limit):
            return {
                "action": "limit",
                "expr": expr,
                "result": expr.doit()
            }
        if isinstance(expr, Integral):
            return {
                "action": "integral",
                "expr": expr,
                "result": expr.doit()
            }
        if isinstance(expr, Derivative):
            return {
                "action": "derivative",
                "expr": expr,
                "result": expr.doit()
            }

        # 3) 求和/连乘
        if isinstance(expr, (Sum, Product)):
            return {
                "action": expr.func.__name__.lower(),  # "sum" / "product"
                "expr": expr,
                "result": expr.doit()
            }

        # 4) 方程/不等式
        if isinstance(expr, (Equality, Relational, Eq)):
            # 选择变量：优先用传入的 prefer_symbol，否则取第一个自由符号
            syms = sorted(expr.free_symbols, key=lambda s: s.name)
            var = prefer_symbol if prefer_symbol in syms else (syms[0] if syms else None)
            if var is None:
                return {"action": "solve", "expr": expr, "result": None, "note": "未发现自变量，无法求解"}
            try:
                # solveset 更健壮，失败再回退 solve
                sol = solveset(expr, var)
            except Exception:
                sol = solve(expr, var)
            return {"action": "solve", "expr": expr, "result": sol, "note": f"solve for {var}"}

        # 5) 普通表达式：根据是否含变量决定数值/化简
        if isinstance(expr, Expr):
            syms = sorted(expr.free_symbols, key=lambda s: s.name)
            if not syms:
                # 纯常数表达式：直接数值
                return {"action": "evalf", "expr": expr, "result": expr.evalf()}
            else:
                # 含变量：先尝试化简；若你希望求导/积分，可根据上下文再路由
                return {"action": "simplify", "expr": expr, "result": simplify(expr), "note": f"free symbols: {syms}"}

        # 6) 兜底
        return {"action": "unknown", "expr": expr, "result": None, "note": f"type={type(expr)}"}
    
    is_latex_format_valid = latex_format_checker(latex_string)
    if is_latex_format_valid != "valid":
        return {"error": "invalid LaTeX format provided $" + latex_string + "$ " + str(is_latex_format_valid) + ". ( LLM_endpoints -> latex_calculator )"}
    return solve_from_latex(latex_string, prefer_symbol=prefer_symbol)
# built-in tools -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- #

# classes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- classes #
class LLM_tool_parameter:
    def __init__(self, 
                    name: str, 
                    description: str, 
                    type_: str, 
                    required: bool=False, 
                    pattern: str=None):
        self.name = name
        self.description = description
        self.type_ = type_
        self.required = required
        self.pattern = pattern
    def to_json(self):
        json_parameter = {
            "type": self.type_,
            "description": self.description,
        }
        if self.pattern != None:
            json_parameter["pattern"] = self.pattern
        return json_parameter
class LLM_tool:
    def __init__(self, 
                 name: str="", 
                 description: str="", 
                 func: callable=None, 
                 parameters=None):
        def construct_parameters(parameters):
            if parameters is None:
                parameters = []
            constructed_parameters = []
            for parameter in parameters:
                if isinstance(parameter, LLM_tool_parameter):
                    constructed_parameters.append(parameter)
                elif isinstance(parameter, dict):
                    constructed_parameters.append(
                        LLM_tool_parameter(
                            name=parameter.get("name", ""),
                            description=parameter.get("description", ""),
                            type_=parameter.get("type_", "string"),
                            required=parameter.get("required", False),
                            pattern=parameter.get("pattern", None),
                        )
                    )
            return constructed_parameters           
        self.name = name
        self.description = description
        self.parameters = construct_parameters(parameters)
        self.func = func
    def to_json(self):
        json_function = {
            "type": "function",
            "name": self.name,
            "description": self.description,
        }
        json_parameters = {
            "type": "object",
            "properties": {},
            "required": [],
        }
        for parameter in self.parameters:
            json_parameters["properties"][parameter.name] = parameter.to_json()
            if parameter.required:
                json_parameters["required"].append(parameter.name)
        json_function["parameters"] = json_parameters
        return json_function
    def execute(self, arguments: dict):
        if self.func is None:
            return {"error": "tool function not implemented (LLM_tool --> execute)"}
        if isinstance(arguments, str):
            arguments = json.loads(arguments)
        elif not isinstance(arguments, dict):
            return {"error": "invalid tool arguments type"}
        return self.func(**arguments)
class LLM_toolkit:
    def __init__(self, tools: dict=None):
        if tools is None:
            tools = {}
        self.tools = tools
    def execute(self, function_name: str, arguments: dict):
        if function_name in self.tools:
            tool = self.tools[function_name]
            return tool.execute(arguments)
        raise ValueError(f"error: tool not found: {function_name} (LLM_toolkit --> execute_tool)")
    def to_json(self):
        json_toolkit = []
        for tool_name in self.tools:
            tool = self.tools[tool_name]
            json_toolkit.append(tool.to_json())
        return json_toolkit
class LLM_endpoint:
    def __init__(self,
                 openai_api_key="",
                 claude_api_key="",
                 gemini_api_key="",
                 provider="openai",
                 model="gpt-4.1"):
        self.retrieval_mode = "force_retrieve"  # options: "force_retrieve", "no_retry", "silent_fail", "retry_[?]_times"
        self.openai_api_key = openai_api_key
        self.claude_api_key = claude_api_key
        self.gemini_api_key = gemini_api_key
        self.provider = provider
        self.model = model
        self.default_payload = {
            "gpt-4.1": {
            "instructions": "",
            "temperature": 0.7,
            "top_p": 1,
            "max_output_tokens": 2048,
            "truncation": "auto" # options: "auto", "disabled"
        }
        }
        self.toolkit = LLM_toolkit()  
    def chat_completion(self, messages, payload=None, callback=None, verbose=False):
        if payload is None:
            payload = {}
        def payload_override(custom_payload):
            nonlocal payload
            payload = self.default_payload.get(self.model, {}) or {}
            payload = {**payload, **custom_payload}
            return payload
        def openai_fetch_response(messages, callback):
            openai_client = OpenAI(api_key=self.openai_api_key)
            with openai_client.responses.create(
                model=self.model,
                input=messages,
                **payload_override(payload),
                tools=self.toolkit.to_json(),
                stream=True
            ) as stream_response:
                collected_chunks = []
                output_message = messages.copy()
                for chunk in stream_response:
                    if chunk.type == "response.output_text.delta":
                        collected_chunks.append(chunk.delta)
                        if verbose:
                            clear_output(wait=True)
                            print("".join(collected_chunks))
                        if callback is not None:
                            callback("".join(collected_chunks))
                    elif chunk.type == "response.error":
                        raise ValueError("error: LLM text generation failed. ( LLM_endpoints -> text_generation )")
                    elif chunk.type == "response.completed":
                        for output in chunk.response.output:
                            if output.type == "function_call":
                                to_append_function_output = self.toolkit.execute(output.name, output.arguments)
                                output_message = output_message + [output] + [{"type": "function_call_output",  
                                                                    "call_id": output.call_id,
                                                                    "output": json.dumps(to_append_function_output, default=str)}]
                            elif output.type == "reasoning":
                                output_message = output_message + [output]
                            elif output.type == "message":
                                to_append_message = output.content[0].text
                                output_message = output_message + [{"role": "assistant", "content": to_append_message}]
                                if callback is not None:
                                    callback(to_append_message)
                            else:
                                output_message = output_message + [output]
                return output_message
        def ollama_fetch_response(messages, callback):
            def build_ollama_tools():
                tools = []
                for tool in self.toolkit.to_json():
                    if tool.get("type") == "function":
                        fn = {k: v for k, v in tool.items() if k != "type"}
                        tools.append({"type": "function", "function": fn})
                    else:
                        tools.append(tool)
                return tools
            request_body = {
                "model": self.model,
                "messages": messages,
                "stream": True,
            }
            ollama_tools = build_ollama_tools()
            if ollama_tools:
                request_body["tools"] = ollama_tools
                request_body["tool_choice"] = "auto"
            if payload:
                request_body["options"] = payload
            collected_chunks = []
            output_message = messages.copy()
            with httpx.stream("POST", "http://localhost:11434/api/chat", json=request_body, timeout=None) as response:
                if response.status_code >= 400:
                    detail = response.read().decode()
                    raise ValueError(f"error: {detail} ( LLM_endpoints -> ollama_fetch_response )")
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("error"):
                        raise ValueError(f"error: {data['error']} ( LLM_endpoints -> ollama_fetch_response )")
                    message = data.get("message") or {}
                    delta = message.get("content", "") or message.get("thinking", "")
                    if delta:
                        collected_chunks.append(delta)
                        if verbose:
                            clear_output(wait=True)
                            print("".join(collected_chunks))
                        if callback is not None:
                            callback("".join(collected_chunks))
                    tool_calls = message.get("tool_calls") or []
                    if tool_calls:
                        for tool_call in tool_calls:
                            fn = tool_call.get("function", {}) or {}
                            name = fn.get("name")
                            arguments = fn.get("arguments", "{}")
                            result = self.toolkit.execute(name, arguments)
                            output_message = output_message + [
                                message,
                                {"role": "tool", "tool_call_id": tool_call.get("id", ""), "content": json.dumps(result, default=str)},
                            ]
                        return output_message
                    if data.get("done", False):
                        full_message = "".join(collected_chunks)
                        output_message = output_message + [{"role": "assistant", "content": full_message}]
                        if callback is not None:
                            callback(full_message)
                        return output_message
            raise ValueError("error: unexpected termination of ollama stream. ( LLM_endpoints -> ollama_fetch_response )")
        def anthropic_fetch_response(messages, callback):
            def convert_messages_to_anthropic(messages):
                """Convert messages to Anthropic format."""
                anthropic_messages = []
                for msg in messages:
                    if isinstance(msg, dict):
                        role = msg.get("role", "")
                        content = msg.get("content", "")
                        if role in ["user", "assistant"]:
                            anthropic_messages.append({"role": role, "content": content})
                        elif role == "tool":
                            # Convert tool results to user message with tool_result content
                            anthropic_messages.append({
                                "role": "user",
                                "content": [{
                                    "type": "tool_result",
                                    "tool_use_id": msg.get("tool_call_id", ""),
                                    "content": msg.get("content", "")
                                }]
                            })
                return anthropic_messages
            
            def convert_tools_to_anthropic(tools_json):
                """Convert LLM_toolkit JSON format to Anthropic tools format."""
                anthropic_tools = []
                for tool in tools_json:
                    if tool.get("type") == "function":
                        anthropic_tool = {
                            "name": tool["name"],
                            "description": tool["description"],
                            "input_schema": tool["parameters"]
                        }
                        anthropic_tools.append(anthropic_tool)
                return anthropic_tools
            
            anthropic_messages = convert_messages_to_anthropic(messages)
            anthropic_tools = convert_tools_to_anthropic(self.toolkit.to_json())
            
            headers = {
                "x-api-key": self.claude_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            
            request_body = {
                "model": self.model,
                "messages": anthropic_messages,
                "max_tokens": payload.get("max_tokens", 4096),
                "stream": True
            }
            
            if anthropic_tools:
                request_body["tools"] = anthropic_tools
            
            if payload.get("temperature") is not None:
                request_body["temperature"] = payload.get("temperature")
            if payload.get("top_p") is not None:
                request_body["top_p"] = payload.get("top_p")
            
            collected_chunks = []
            output_message = messages.copy()
            tool_uses = []
            
            with httpx.stream("POST", "https://api.anthropic.com/v1/messages", json=request_body, headers=headers, timeout=None) as response:
                if response.status_code >= 400:
                    detail = response.read().decode()
                    raise ValueError(f"error: {detail} ( LLM_endpoints -> anthropic_fetch_response )")
                response.raise_for_status()
                
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        line = line[6:]  # Remove "data: " prefix
                    
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    
                    event_type = data.get("type")
                    
                    if event_type == "content_block_start":
                        content_block = data.get("content_block", {})
                        if content_block.get("type") == "tool_use":
                            tool_uses.append({
                                "id": content_block.get("id"),
                                "name": content_block.get("name"),
                                "input": ""
                            })
                    
                    elif event_type == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            collected_chunks.append(text)
                            if verbose:
                                clear_output(wait=True)
                                print("".join(collected_chunks))
                            if callback is not None:
                                callback("".join(collected_chunks))
                        elif delta.get("type") == "input_json_delta":
                            # Accumulate tool input
                            if tool_uses:
                                tool_uses[-1]["input"] += delta.get("partial_json", "")
                    
                    elif event_type == "message_delta":
                        stop_reason = data.get("delta", {}).get("stop_reason")
                        if stop_reason == "tool_use":
                            # Execute tool calls
                            for tool_use in tool_uses:
                                try:
                                    tool_input = json.loads(tool_use["input"])
                                except json.JSONDecodeError:
                                    tool_input = tool_use["input"]
                                
                                try:
                                    result = self.toolkit.execute(tool_use["name"], tool_input)
                                    output_message = output_message + [
                                        {"role": "assistant", "content": json.dumps({"tool_use": {"id": tool_use["id"], "name": tool_use["name"], "input": tool_input}}, default=str)},
                                        {"role": "tool", "tool_call_id": tool_use["id"], "content": json.dumps(result, default=str)}
                                    ]
                                except Exception as e:
                                    output_message = output_message + [
                                        {"role": "assistant", "content": json.dumps({"tool_use": {"id": tool_use["id"], "name": tool_use["name"], "input": tool_input}}, default=str)},
                                        {"role": "tool", "tool_call_id": tool_use["id"], "content": json.dumps({"error": str(e)}, default=str)}
                                    ]
                            return output_message
                    
                    elif event_type == "message_stop":
                        full_message = "".join(collected_chunks)
                        if full_message:
                            output_message = output_message + [{"role": "assistant", "content": full_message}]
                            if callback is not None:
                                callback(full_message)
                        return output_message
            
            raise ValueError("error: unexpected termination of anthropic stream. ( LLM_endpoints -> anthropic_fetch_response )")
        def gemini_fetch_response(messages, callback):
            def convert_messages_to_gemini(messages):
                """Convert messages to Gemini format."""
                gemini_contents = []
                for msg in messages:
                    if isinstance(msg, dict):
                        role = msg.get("role", "")
                        content = msg.get("content", "")
                        
                        if role == "user":
                            gemini_contents.append({"role": "user", "parts": [{"text": content}]})
                        elif role == "assistant":
                            gemini_contents.append({"role": "model", "parts": [{"text": content}]})
                        elif role == "tool":
                            # Convert tool results to function response
                            gemini_contents.append({
                                "role": "function",
                                "parts": [{
                                    "functionResponse": {
                                        "name": msg.get("tool_call_id", ""),
                                        "response": {"content": msg.get("content", "")}
                                    }
                                }]
                            })
                return gemini_contents
            
            def convert_tools_to_gemini(tools_json):
                """Convert LLM_toolkit JSON format to Gemini tools format."""
                gemini_tools = []
                for tool in tools_json:
                    if tool.get("type") == "function":
                        gemini_tool = {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parameters": tool["parameters"]
                        }
                        gemini_tools.append(gemini_tool)
                return gemini_tools
            
            gemini_contents = convert_messages_to_gemini(messages)
            gemini_tools = convert_tools_to_gemini(self.toolkit.to_json())
            
            # Build API URL with API key
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?key={self.gemini_api_key}&alt=sse"
            
            headers = {
                "content-type": "application/json"
            }
            
            request_body = {
                "contents": gemini_contents,
                "generationConfig": {}
            }
            
            if gemini_tools:
                request_body["tools"] = [{"functionDeclarations": gemini_tools}]
            
            if payload.get("temperature") is not None:
                request_body["generationConfig"]["temperature"] = payload.get("temperature")
            if payload.get("top_p") is not None:
                request_body["generationConfig"]["topP"] = payload.get("top_p")
            if payload.get("max_tokens") is not None:
                request_body["generationConfig"]["maxOutputTokens"] = payload.get("max_tokens")
            
            collected_chunks = []
            output_message = messages.copy()
            function_calls = []
            
            with httpx.stream("POST", api_url, json=request_body, headers=headers, timeout=None) as response:
                if response.status_code >= 400:
                    detail = response.read().decode()
                    raise ValueError(f"error: {detail} ( LLM_endpoints -> gemini_fetch_response )")
                response.raise_for_status()
                
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        line = line[6:]  # Remove "data: " prefix
                    
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    
                    candidates = data.get("candidates", [])
                    for candidate in candidates:
                        content = candidate.get("content", {})
                        parts = content.get("parts", [])
                        
                        for part in parts:
                            if "text" in part:
                                text = part["text"]
                                collected_chunks.append(text)
                                if verbose:
                                    clear_output(wait=True)
                                    print("".join(collected_chunks))
                                if callback is not None:
                                    callback("".join(collected_chunks))
                            elif "functionCall" in part:
                                function_call = part["functionCall"]
                                function_calls.append(function_call)
                        
                        finish_reason = candidate.get("finishReason")
                        if finish_reason:
                            if function_calls:
                                # Execute function calls
                                for func_call in function_calls:
                                    try:
                                        func_name = func_call.get("name")
                                        func_args = func_call.get("args", {})
                                        result = self.toolkit.execute(func_name, func_args)
                                        output_message = output_message + [
                                            {"role": "assistant", "content": json.dumps({"function_call": func_call}, default=str)},
                                            {"role": "tool", "tool_call_id": func_name, "content": json.dumps(result, default=str)}
                                        ]
                                    except Exception as e:
                                        output_message = output_message + [
                                            {"role": "assistant", "content": json.dumps({"function_call": func_call}, default=str)},
                                            {"role": "tool", "tool_call_id": func_name, "content": json.dumps({"error": str(e)}, default=str)}
                                        ]
                                return output_message
                            else:
                                full_message = "".join(collected_chunks)
                                if full_message:
                                    output_message = output_message + [{"role": "assistant", "content": full_message}]
                                    if callback is not None:
                                        callback(full_message)
                                return output_message
            
            raise ValueError("error: unexpected termination of gemini stream. ( LLM_endpoints -> gemini_fetch_response )")
        if self.provider == "openai":
            return openai_fetch_response(messages, callback)
        elif self.provider == "ollama":
            return ollama_fetch_response(messages, callback)
        elif self.provider == "anthropic":
            return anthropic_fetch_response(messages, callback)
        elif self.provider == "gemini":
            return gemini_fetch_response(messages, callback)
        else:
            raise ValueError("error: unsupported provider specified. ( LLM_endpoints -> chat_completions )")
# classes --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- #