import ConfirmInteract from "./confirm_interact";
import MultiChoiceInteract from "./multi_choice_interact";
import TextInputInteract from "./text_input_interact";

const interactRegistry = {
  confirmation: ConfirmInteract,
  multi_choice: MultiChoiceInteract,
  text_input: TextInputInteract,
};

export default interactRegistry;
