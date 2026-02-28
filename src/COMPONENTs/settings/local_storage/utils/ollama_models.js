import { api } from "../../../../SERVICEs/api";

export const fetchOllamaModels = async () => {
  return api.ollama.listModels();
};

export const deleteOllamaModel = async (name) => {
  return api.ollama.deleteModel(name);
};
