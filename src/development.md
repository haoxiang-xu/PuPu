# Development Guide

- <span style="font-size: 20px">[`Containers`](#containers)</span>
  - [`Config`](#config-container)
  - [`Status`](#status-container)
  - [`Request`](#request-container)
  - [`Data`](#data-container)
- <span style="font-size: 20px">[`Components`](#components)</span>
  - [`# Context Menu`](#context-menu)


# Containers <a name="containers"></a>

<span style="opacity: 0.32">containers are the main building blocks of the application. They are responsible for managing the state of the application and for rendering the components. Each container component is composed of a </span>`Container`<span style="opacity: 0.32"> component and a </span>`Context.Provider`<span style="opacity: 0.32"> component. </span>

### Config Container <a name="config-container"></a>

---

<span style="opacity: 0.32">Setting related variables.</span>

- `theme, setTheme`
- `RGB, setRGB`
- `colorOffset, setColorOffset`

### Status Container <a name="status-container"></a>

---

<span style="opacity: 0.32">Status for UI, running processes, server status, etc.</span>

- `componentOnFocus, setComponentOnFocus`
  - `side_menu`
  - `chat`
    - `chat_model_selector`
  - `settings`
- `onDialog, setOnDialog`

  - `""` no dialog should be shown.
  - `await_ollama_setup_warning`
  - `download_ollama_model`
  - `settings`
  - `image_viewer|image_base64`

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
  - `image_to_text|[]`
  - `null`

### Request Container <a name="request-container"></a>

---

<span style="opacity: 0.32">Request Functions to local remote server.</span>

### Data Container <a name="data-container"></a>

---

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
/* [ mode ] "chat" / "terminal" */
[
    @: {
        address: `address`,
        n_turns_to_regenerate_title: #,
        last_edit_date: `date_of_last_edit`,
        language_model_using: `language_model`,
        on_mode: `chat`,
        messages: [{`list_of_json_that_stores_messages`}],
    },
]
/* [ content ] same with message, to have this variable is just for different standard APIs */
/* [ expanded ] for user and asistent this variable indicates different thing, for deepseek models if expanded === false, the thought process will be shown */
/* [ image ] a list of image addresses, address is structured as `address_messageIndex_imageIndex` */
[
  {
    role: `role_of_sender`,
    content: `message_content`,
    message: `message_content`,
    images: [`list_of_images`],
    expanded: false,
  },
];
```

## Components <a name="components"></a>

### Context Menu <a name="context-menu"></a>

<span style="opacity: 0.32">Complex Json Format data structures.</span>

- `width` <span style="opacity: 0.32">Width of the menu</span>

- `options`

```js
/* [ img_src ] image source */
/* [ x ] if x is not defined, the menu will be shown at the mouse click position */
[
  {
    img_src: "image_src_string",
    label: "label_string",
    onClick: () => {},
  },
];
```

- `x` <span style="opacity: 0.32">If x is not defined, the menu will be shown at the mouse click position (optional).</span>
- `y` <span style="opacity: 0.32">If y is not defined, the menu will be shown at the mouse click position (optional).</span>