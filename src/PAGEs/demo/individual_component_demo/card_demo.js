import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { CustomizedTooltip } from "../demo";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const CardDemo = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const fontFamily = theme?.font?.fontFamily || "Jost";

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
          fontFamily,
          color,
          userSelect: "none",
        }}
      >
        Card
      </span>

      {/* ---- Basic card ---- */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Card title="Basic" width={260}>
  <p>A simple tilt card.</p>
</Card>
\`\`\`
`}
      >
        <Card title="Basic" width={260}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontFamily,
              lineHeight: 1.5,
              color,
            }}
          >
            Hover to see the 3D tilt effect.
          </p>
        </Card>
      </CustomizedTooltip>

      {/* ---- Card with icon layer ---- */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Card title="Layered" width={260}>
  <Card.Layer depth={30}>
    <Icon src="notification_on" />
  </Card.Layer>
</Card>
\`\`\`
`}
      >
        <Card title="Layered" width={260}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              transformStyle: "preserve-3d",
            }}
          >
            <Card.Layer depth={30}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  src="notification_on"
                  style={{ width: 24, height: 24 }}
                  color={color}
                />
              </div>
            </Card.Layer>
            <Card.Layer depth={20}>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily,
                    color,
                  }}
                >
                  Notifications
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily,
                    color,
                    opacity: 0.5,
                    marginTop: 2,
                  }}
                >
                  3 unread messages
                </div>
              </div>
            </Card.Layer>
          </div>
        </Card>
      </CustomizedTooltip>

      {/* ---- Stats card with deep parallax ---- */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Card
  title="Stats"
  width={200}
  max_tilt={16}
>
  <Card.Layer depth={40}>
    ...
  </Card.Layer>
</Card>
\`\`\`
`}
      >
        <Card title="Stats" width={200} max_tilt={16}>
          <Card.Layer depth={40}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                fontFamily,
                color,
                lineHeight: 1,
              }}
            >
              2.4k
            </div>
          </Card.Layer>
          <Card.Layer depth={20}>
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color,
                opacity: 0.45,
                marginTop: 6,
              }}
            >
              Active users today
            </div>
          </Card.Layer>
        </Card>
      </CustomizedTooltip>

      {/* ---- Subtle tilt card ---- */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Card
  title="Subtle"
  width={220}
  max_tilt={8}
/>
\`\`\`
`}
      >
        <Card title="Subtle" width={220} max_tilt={8}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily,
              lineHeight: 1.5,
              color,
              opacity: 0.7,
            }}
          >
            Subtle tilt only.
          </p>
        </Card>
      </CustomizedTooltip>

      {/* ---- Wide card with multiple layers ---- */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Card width={360} max_tilt={10}>
  <Card.Layer depth={50}>
    {/* front content */}
  </Card.Layer>
  <Card.Layer depth={15}>
    {/* back content */}
  </Card.Layer>
</Card>
\`\`\`
`}
      >
        <Card width={360} max_tilt={10}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              transformStyle: "preserve-3d",
            }}
          >
            <Card.Layer depth={50}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  background: isDark
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : "linear-gradient(135deg, #6366f1, #a78bfa)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
                }}
              >
                <Icon
                  src="bolt"
                  style={{ width: 28, height: 28 }}
                  color="#fff"
                />
              </div>
            </Card.Layer>
            <Card.Layer depth={25}>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily,
                    color,
                  }}
                >
                  Performance
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontFamily,
                    color,
                    opacity: 0.5,
                    marginTop: 3,
                  }}
                >
                  Everything running smoothly
                </div>
              </div>
            </Card.Layer>
          </div>
        </Card>
      </CustomizedTooltip>
    </div>
  );
};

export default CardDemo;
