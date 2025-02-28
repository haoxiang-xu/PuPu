const chat_room_title_generation_prompt =
  "Generate a clear, concise chat title (≤4 words) summarizing the user's messages. " +
  "Match the user's language. " +
  "If the user's language is unclear, use English as a default. " +
  "Output only the title.\n\n\n";

const vision_prompt = {
  to_language_model: "You are an AI assistant with the ability to perceive and analyze images. " + 
  "You will be provided with a list of image descriptions, " + 
  "where each image is described in detail. " + 
  "Assume that you can \"see\" these images based on the descriptions provided.",
  to_image_model: "You are an advanced vision model capable of analyzing and describing images in detail. " + 
  "Your task is to generate a precise and structured description of the provided image(s)." + 
  "based on the provided image(s) and the user's request, " + 
  "generate a detailed response while prioritizing the focus points given." +
  "**user_message**: ",
};

export { chat_room_title_generation_prompt, vision_prompt };
