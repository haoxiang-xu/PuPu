# Changelog

### Version 0.0.2

- `New STUFF`
  - Ollama Models management panel allowing users to pull or delete models.
  - Consistent more options menu.
  - Support fot light and dark theme.

- `Reported BUGs`
  - When the downloaded model having a name that does not match the model name in the model list, the app will crash.
  - App was acting weird when there is no model installed. [x] - 0.0.3
  - Selected model will not be changed after the model is deleted. [x] - 0.0.3
  - Current message will lost if chat room is changed.
  - Downloading list will lost pending models after the first model is downloaded.
  - If there's no reponse coming back show delete the loading tag.
  - when app started should use default system theme.

### Version 0.0.1

- `Reported BUGs`
  - `DARWIN` MACOS mainWindow will not show up after minimized [X] - 0.0.2
  - `WIN32` Installasion will be default to the C drive on Windows
  - `WIN32` logo resolution error
  - Markdown internal link will direct to the empty page [X] - 0.0.2
  - Loading Tag should be removed if there is no response from the server coming back.
  - Code LLM could cause Markdown rendering error.
  - Regenerated message will not trigger the message list to auto scroll to that position.
