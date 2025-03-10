const list_of_setting_menus = {
  root: {
    sub_menus: ["models", "local_storage"],
  },
  models: {
    title: "models",
    img_src: "models",
    sub_menus: ["language_models", "vision_models"],
  },
  local_storage: {
    title: "storage",
    img_src: "local_storage",
  },
  language_models: {
    title: "language",
    img_src: "chat",
  },
  vision_models: {
    title: "vision",
    img_src: "vision",
  },
};

export { list_of_setting_menus };
