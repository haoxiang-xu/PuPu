# Development Guide

## Containers

<span style="opacity: 0.32">containers are the main building blocks of the application. They are responsible for managing the state of the application and for rendering the components. Each container component is composed of a </span>`Container`<span style="opacity: 0.32"> component and a </span>`Context.Provider`<span style="opacity: 0.32"> component. </span>

### Config Container

<span style="opacity: 0.32">Setting related variables.</span>

- `theme, setTheme`
- `RGB, setRGB`
- `colorOffset, setColorOffset`

### Status Container

<span style="opacity: 0.32">Status for UI, running processes, server status, etc.</span>

- `componentOnFocus, setComponentOnFocus`

- `onDialog, setOnDialog`

  - `null` no dialog should be shown.
  - `await_Ollama_setup_warning` 

- `ollamaServerStatus, setOllamaServerStatus`
  <span style="opacity: 0.5">
  This variable is show the status of the server. whelther it is running or not. Notice that the way of checking the status of the server is by sending a request to the server.
  </span>

  - `null` await for response from the server. which indicates the checking request is on the way.
  - `true` the server is running.
  - `false` the server is not running.

- `windowIsMaximized, setWindowIsMaximized`
- `windowWidth, setWindowWidth`

- `ollamaOnTask, setOllamaOnTask` <span style="opacity: 0.5">
  This variable is show the on going task of the ollama Rest API server. The string define between</span> `[]` <span style="opacity: 0.5">will be displayed as the on going task.
  </span>

  - `chat_completion_streaming|[]`
  - `generate_no_streaming|[]`
  - `force_stop|[]`
  - `null`

### Request Container

<span style="opacity: 0.32">Request Functions to local remote server.</span>

### Data Container

<span style="opacity: 0.32">Complex Json Format data structures.</span>

- `addressBook, setAddressBook`

```js
/* [ @ ] indicates the address */
{
    avaliable_addresses: [`list_of_addresses`],
    @: { 
        chat_title: `string_that_describes_conversation`,
    }
}
```

- `sectionData, setSectionData`

```js
/* [ messages ] structure will be shown below */
[
    @: {
        address: `address`,
        n_turns_to_regenerate_title: #,
        last_edit_date: `date_of_last_edit`,
        messages: [{`list_of_json_that_stores_messages`}],
    },
]
/* [ content ] same with message, to have this variable is just for different standard APIs */
/* [ expanded ] for user and asistent this variable indicates different thing, for deepseek models if expanded === false, the thought process will be shown */
[
  {
    role: `role_of_sender`,
    content: `message_content`,
    message: `message_content`,
    expanded: false,
  },
];
```


