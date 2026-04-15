import CodeDiffInteract from "./code_diff_interact";
import ConfirmInteract from "./confirm_interact";
import MultiChoiceInteract from "./multi_choice_interact";
import MultiSelectInteract from "./multi_select_interact";
import SingleSelectInteract from "./single_select_interact";
import TextInputInteract from "./text_input_interact";

const interactRegistry = {
  confirmation: ConfirmInteract,
  multi_choice: MultiChoiceInteract,
  single: SingleSelectInteract,
  multi: MultiSelectInteract,
  text_input: TextInputInteract,
  code_diff: CodeDiffInteract,
};

export default interactRegistry;
