## VARIABLEs

`addressBook`

```js
{
    avaliable_addresses: [`list_of_addresses`],
    @: {
        chat_title: `string_that_describes_conversation`,
    }
}
```

`sectionData`

```js
[
    @: {
        address: `address`,
        n_turns_to_regenerate_title: #,
        last_edit_date: `date_of_last_edit`,
        messages: [`list_of_messages`],
    },
]
```

`messages`

```js
[
  {
    role: `role_of_sender`,
    content: `message_content`,
    message: `message_content`,
    expanded: false,
  },
];
```
