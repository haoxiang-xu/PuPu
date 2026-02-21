import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Input, {
  SinkingInput,
  InputWithDelete,
  Password,
  ValidationCodeInput,
  FloatingInput,
} from "../../../BUILTIN_COMPONENTs/input/input";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { CustomizedTooltip } from "../demo";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const InputDemo = () => {
  const { theme } = useContext(ConfigContext);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color: theme?.color || "black",

          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        Inputs
      </span>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput label="User name" style={{ width: "200px" }} />
\`\`\` 
          `}
      >
        <SinkingInput label="User name" style={{ width: "200px" }} />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput prefix_icon="edit" prefix_label="Prefix" />
\`\`\` 
          `}
      >
        <SinkingInput prefix_icon="edit" prefix_label="Prefix" />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput prefix_label="Prefix" />
\`\`\` 
          `}
      >
        <SinkingInput prefix_label="Prefix" />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput postfix_label="Postfix" />
\`\`\` 
          `}
      >
        <SinkingInput postfix_label="Postfix" />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<Password />
\`\`\` 
          `}
      >
        <Password />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<ValidationCodeInput />
\`\`\` 
          `}
      >
        <ValidationCodeInput />
      </CustomizedTooltip>
      <Tooltip
        position="bottom"
        tooltip_component={
          <Markdown
            style={{
              pre: {
                margin: 0,
                border: "1px solid #E0E0E0",
              },
            }}
          >{` 
\`\`\`js
<SinkingInput
  prefix_icon="link"
  prefix_label="https://"
  postfix_label=".com"
  no_separator
/>
\`\`\` 
          `}</Markdown>
        }
        trigger={["hover"]}
        style={{
          padding: 4,
          borderRadius: 10,
        }}
        close_delay={80}
      >
        <SinkingInput
          prefix_icon="link"
          prefix_label="https://"
          postfix_label=".com"
          no_separator
        />
      </Tooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput
  label="search on Google"
  prefix_icon="search"
  prefix_label="G"
  no_separator
/>
\`\`\` 
          `}
      >
        <SinkingInput
          label="search on Google"
          prefix_icon="search"
          prefix_label="G"
          no_separator
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<InputWithDelete label="Delete me" />
\`\`\` 
          `}
      >
        <InputWithDelete label="Delete me" />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<SinkingInput
  label="with Switch"
  postfix_component={<SemiSwitch />}
  no_separator
/>
\`\`\` 
          `}
      >
        <SinkingInput
          label="with Switch"
          postfix_component={<SemiSwitch />}
          no_separator
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput label="Username" />
\`\`\`
`}
      >
        <FloatingInput label="Username" style={{ width: 200 }} />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput label="Email" placeholder="you@example.com" />
\`\`\`
`}
      >
        <FloatingInput
          label="Email"
          placeholder="you@example.com"
          style={{ width: 240 }}
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput placeholder="No label" />
\`\`\`
`}
      >
        <FloatingInput placeholder="No label" style={{ width: 180 }} />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput
  label="Website"
  prefix_icon="link"
  prefix_label="https://"
  postfix_label=".com"
/>
\`\`\`
`}
      >
        <FloatingInput
          label="Website"
          prefix_icon="link"
          prefix_label="https://"
          postfix_label=".com"
          style={{ width: 320 }}
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput
  label="Search"
  prefix_icon="search"
/>
\`\`\`
`}
      >
        <FloatingInput
          label="Search"
          prefix_icon="search"
          style={{ width: 220 }}
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<FloatingInput
  label="with Switch"
  postfix_component={<SemiSwitch />}
/>
\`\`\`
`}
      >
        <FloatingInput
          label="with Switch"
          postfix_component={<SemiSwitch />}
          style={{ width: 220 }}
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<Input placeholder="Ghost input" />
\`\`\`
`}
      >
        <Input placeholder="Ghost input" style={{ width: 200 }} />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<Input
  placeholder="Search"
  prefix_icon="search"
/>
\`\`\`
`}
      >
        <Input
          placeholder="Search"
          prefix_icon="search"
          style={{ width: 220 }}
        />
      </CustomizedTooltip>
      <CustomizedTooltip
        code={`
\`\`\`js
<Input
  placeholder="Website"
  prefix_label="https://"
  postfix_label=".com"
/>
\`\`\`
`}
      >
        <Input
          placeholder="Website"
          prefix_label="https://"
          postfix_label=".com"
          style={{ width: 280 }}
        />
      </CustomizedTooltip>
    </div>
  );
};
export default InputDemo;
