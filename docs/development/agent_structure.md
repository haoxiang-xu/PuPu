# Agent Structure

## Overview

The agent structure is a JSON object that defines the structure of the agent. It will start will a `start` node and end with an `end` node. The agent structure will have a series of nodes that will be connected to each other. Each node will have a `type` and a `next_nodes` array that will define the next nodes that will be executed after the current node. The agent structure will also have a `variables` object that will store the variables that will be used in the agent. The agent structure will also have a `agent_name` that will be the name of the agent.

## Types of Nodes

### Root Components
```js
{
    agent_name: "_user_defined_agent_name_",
    /* { nodes } ---------------------------- */
    variables: {
        ud_text_1: "text",
        ud_image_1: "Base64image",
        ud_message_1: "json{}",
        llm_generated_text: "text",
        itt_generated_text: "text",
    },
}
```

### `Start Node`

```js
// start node must having the id of `start`
start: {
    type: "start_node",
    next_nodes: ['ud_node_id'],
}
```

### `Image to Text Node`

```js
image_to_text_node: {
    type: "image_to_text_node",
    model_used: "t5-base",
    update_callback: function(),
    input: "ud_images_array", //array of base64 images
    prompt: "${llm_generated_text}$ prompt",
    output: "output_text_variable_name",
    next_nodes: ['ud_node_id'],
}
```

### `Chat Completion Node` 

```js
chat_completion_node: {
    type: "chat_completion_node",
    model_used: "gpt-3.5-turbo",
    model_provider: "openai",
    update_callback: function(),
    input: "ud_message_1", //json object
    prompt: "${ud_message_1}$ prompt",
    output: "llm_generated_text",
    next_nodes: ['ud_node_id'],
}
```

### `Title Generation Node`

```js
title_generation_node: {
    type: "title_generation_node",
    model_used: "gpt-3.5-turbo",
    model_provider: "openai",
    update_callback: function(),
    input: "ud_message_1",
    prompt: "${llm_generated_text}$ prompt",
    output: "title_generated",
    next_nodes: ['ud_node_id'],
}
```

### `Prompt Generation Node`

```js
prompt_generation_node: {
    type: "prompt_generation_node",
    model_used: "gpt-3.5-turbo",
    model_provider: "openai",
    update_callback: function(),
    prompt: "${llm_generated_text}$ prompt",
    output: "prompt_generated",
    next_nodes: ['ud_node_id'],
}

```

### `End Node`

```js
// end node must having the id of `end`
end: {
    type: "end_node",
    next_nodes: [],
}
```
