# LLM Agent Manager

## Functionalities

- a storage system should be able to store the structure of combined LLMs. (predefined and user-defined LLMs)
  - Since LLMs are working in sequence, the storage system should be able to store the sequence of LLMs.
  - Since LLMs can be performed different types of operations, the storage system should be able to store the operation type of LLMs.

Below is a sample structure of the LLMs in the sequence.

```js
{
    name: "user_defined_agent_name",
    id: "random_generated_string",
    root: {
        source_model: "deepseek:r1",
        name: "user_defined_model_name",
        type: "json_format",
        request_structure: {
            prompt: "Decide what kind of task user wants to perform, " +
            "if user require code completion, provide the first model" +
            "if user asked a math problem, provide the second model",
            format: {
                required_llm_1: "boolean",
                required_llm_2: "boolean",
                required_llm_3: "boolean",
            },
            required: ["required_llm_1", "required_llm_2", "required_llm_3"],
        }
        next_model_in_sequence: {
            required_llm_1: "llm_1",
            required_llm_2: "llm_2",
            required_llm_3: "llm_3",
        }
    },
    llm_1: {
        source_model: "codellama",
        name: "user_defined_model_name",
        type: "completion",
        request_structure: {
            prompt: "try to complete the code",
        }
        next_model_in_sequence: {}, // if there is no next model in the sequence then it should be empty
    },
    ...
}
```

- Execution of the LLMs in the sequence.
  - Since all the LLMs should be executed in the sequence, the next request should be sent to the ollama server only after the previous LLM is executed.
  - Each type of LLM should have their own type of request, and u should figure out how to send the request to the ollama server based on the json structure of the LLM.


- Tasks:
    1. root model 是一个 json format return的model，你写几个request测试一下，怎么样的format和request可以让模型做到多选一的功能，然后优化一下我上面的存储结构，让它可以存储这个信息。
    2. 确认上述的数据格式是否可以支持多个model的sequence，如果不行，优化一下数据结构。在设计的时候，要留一些容予的空间，之后穿插在中间的不一定是model也可能使web search等等。
    3. 写一个function read上述的数据格式，然后根据上述的格式发送request，然后有另外一个json结构存储每个模型的输出，然后把这个json结构返回。