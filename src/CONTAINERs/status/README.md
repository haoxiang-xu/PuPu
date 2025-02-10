## Ollama

`ollamaServerStatus`
<span style="opacity: 0.5">
This variable is show the status of the server. whelther it is running or not. Notice that the way of checking the status of the server is by sending a request to the server.
</span>

- `null` await for response from the server. which indicates the checking request is on the way.
- `true` the server is running.
- `false` the server is not running.

<br>

`ollamaOnTask`
<span style="opacity: 0.5">
This variable is show the on going task of the ollama Rest API server. The string define between</span> `[]` <span style="opacity: 0.5">will be displayed as the on going task.
</span>

- `chat_completion_streaming|[]`
- `generate_no_streaming|[]`
- `force_stop|[]`
- `null`
