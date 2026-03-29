import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { getChatsStore, openCharacterChat } from "../../../SERVICEs/chat_storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const CHARACTER_SUB_PAGES = [
  { key: "added", icon: "check", label: "Following" },
  { key: "find", icon: "search", label: "Discover" },
];

const FONT = "Jost, sans-serif";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Helpers                                                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const resolveAvatarSrc = (character) => {
  const rawUrl =
    typeof character?.avatar?.url === "string" ? character.avatar.url.trim() : "";
  if (rawUrl) {
    return rawUrl;
  }

  const rawPath = character?.avatar?.absolute_path;
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return "";
  }

  const trimmed = rawPath.trim();
  if (/^(https?:|data:|file:)/i.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? encodeURI(`file://${normalized}`)
    : encodeURI(`file:///${normalized}`);
};

const fallbackInitial = (character) => {
  const name = typeof character?.name === "string" ? character.name.trim() : "";
  return name ? name.charAt(0).toUpperCase() : "C";
};

const listTagsForCharacter = (character) => {
  const tags = Array.isArray(character?.metadata?.list_tags)
    ? character.metadata.list_tags
    : [];
  return tags
    .filter((tag) => typeof tag === "string" && tag.trim())
    .map((tag) => tag.trim());
};

const ageLabelForCharacter = (character) => {
  const age = character?.metadata?.age;
  if (Number.isFinite(Number(age))) {
    return String(Number(age));
  }
  return "";
};

const subtitleForCharacter = (character) => {
  const parts = [];
  const role =
    typeof character?.role === "string" && character.role.trim()
      ? character.role.trim()
      : "";
  const primaryLanguage =
    typeof character?.metadata?.primary_language === "string"
      ? character.metadata.primary_language.trim()
      : "";

  if (role) {
    parts.push(role);
  }
  if (primaryLanguage) {
    parts.push(primaryLanguage);
  }
  return parts.join(" · ");
};

const workLabelForCharacter = (character) =>
  typeof character?.role === "string" ? character.role.trim() : "";

const resolveSourceModelIdFromStore = () => {
  const store = getChatsStore();
  const activeChat =
    store?.activeChatId && store?.chatsById?.[store.activeChatId]
      ? store.chatsById[store.activeChatId]
      : null;
  if (!activeChat || activeChat.kind === "character") {
    return "";
  }

  const modelId =
    typeof activeChat.model?.id === "string" ? activeChat.model.id.trim() : "";
  return modelId && modelId !== "miso-unset" ? modelId : "";
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Shared presentational                                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CharacterStatePanel = ({
  icon,
  title,
  body,
  isDark,
  testId,
}) => (
  <div
    data-testid={testId}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      gap: 12,
      textAlign: "center",
      flex: 1,
    }}
  >
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
      }}
    >
      <Icon
        src={icon}
        style={{ width: 22, height: 22 }}
        color={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
      />
    </div>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "NunitoSans, sans-serif",
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontSize: 12,
        fontFamily: FONT,
        color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
        maxWidth: 300,
        lineHeight: 1.55,
      }}
    >
      {body}
    </div>
  </div>
);

const CharacterAvatar = ({ character, isDark, size = 54 }) => {
  const [imageBroken, setImageBroken] = useState(false);
  const avatarSrc = resolveAvatarSrc(character);
  const showImage = Boolean(avatarSrc) && !imageBroken;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? "linear-gradient(160deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))"
          : "linear-gradient(160deg, rgba(0,0,0,0.08), rgba(0,0,0,0.025))",
        color: isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.74)",
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
        fontFamily: "NunitoSans, sans-serif",
        letterSpacing: "0.03em",
      }}
    >
      {showImage ? (
        <img
          src={avatarSrc}
          alt={`${character?.name || "character"} avatar`}
          onError={() => setImageBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span data-testid={`character-avatar-fallback-${character?.id || "unknown"}`}>
          {fallbackInitial(character)}
        </span>
      )}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Left: Contact Row                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CharacterContactRow = ({ character, isDark, isSelected, onClick, onOpenChat }) => {
  const [hovered, setHovered] = useState(false);

  const bg = isSelected
    ? isDark
      ? "rgba(255,255,255,0.09)"
      : "rgba(0,0,0,0.065)"
    : hovered
      ? isDark
        ? "rgba(255,255,255,0.055)"
        : "rgba(0,0,0,0.045)"
      : "transparent";

  return (
    <div
      data-testid={`character-row-${character?.id || "unknown"}`}
      onClick={() => onClick && onClick(character)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 48,
        padding: "6px 12px",
        margin: 0,
        borderRadius: 7,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        background: bg,
        opacity: isSelected ? 1 : 0.8,
        transition: "background 0.15s ease, opacity 0.15s ease",
      }}
    >
      <CharacterAvatar character={character} isDark={isDark} size={36} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            color: isDark ? "#fff" : "#171717",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {character?.name || "Character"}
        </div>
      </div>

      {onOpenChat ? (
        <Button
          prefix_icon="chat"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChat(character);
          }}
          style={{
            paddingVertical: 5,
            paddingHorizontal: 5,
            borderRadius: 7,
            opacity: hovered || isSelected ? 0.72 : 0.42,
            flexShrink: 0,
            content: {
              icon: { width: 15, height: 15 },
            },
          }}
        />
      ) : null}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Right: Detail Panel (with delete support)                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Circular action button for detail panel (using Button component) ── */
const DetailActionCircle = ({ icon, label, color, isDark, onClick, disabled }) => {
  const baseColor = color || (isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)");

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Button
        prefix_icon={icon}
        disabled={disabled}
        style={{
          iconOnlyPaddingVertical: 16,
          iconOnlyPaddingHorizontal: 16,
          borderRadius: 999,
          color: baseColor,
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          hoverBackgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
          content: {
            icon: { width: 19, height: 19 },
          },
        }}
      />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          fontFamily: FONT,
          color: baseColor,
        }}
      >
        {label}
      </span>
    </div>
  );
};

const CharacterDetailPanel = ({
  character,
  isDark,
  onOpenChat,
  isOpening,
  openError,
  onRemove,
  isRemoving,
}) => {
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [character?.id]);

  if (!character) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: isDark
              ? "rgba(255,255,255,0.055)"
              : "rgba(0,0,0,0.045)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            src="user"
            style={{ width: 22, height: 22 }}
            color={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
          />
        </div>
        <div
          style={{
            fontSize: 13,
            fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
          }}
        >
          Select a character
        </div>
      </div>
    );
  }

  const tags = listTagsForCharacter(character);
  const ageLabel = ageLabelForCharacter(character);
  const subtitle = subtitleForCharacter(character);
  const workLabel = workLabelForCharacter(character);
  const avatarSrc = resolveAvatarSrc(character);
  const showImage = Boolean(avatarSrc) && !imageBroken;

  const groupBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.03)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  return (
    <div
      data-testid={`character-detail-${character?.id || "unknown"}`}
      style={{
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 24px 28px",
        gap: 0,
      }}
    >
      {/* ── Square avatar ── */}
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: 7,
          overflow: "hidden",
          flexShrink: 0,
          background: isDark
            ? "linear-gradient(145deg, #2a2d30 0%, #1a1d20 100%)"
            : "linear-gradient(145deg, #d8dddf 0%, #c2c7ca 100%)",
        }}
      >
        {showImage ? (
          <img
            src={avatarSrc}
            alt={`${character?.name || "character"} avatar`}
            onError={() => setImageBroken(true)}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            data-testid={`character-avatar-fallback-${character?.id || "unknown"}`}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)",
              fontSize: 56,
              fontWeight: 700,
              fontFamily: "NunitoSans, sans-serif",
            }}
          >
            {fallbackInitial(character)}
          </div>
        )}
      </div>

      {/* ── Name + subtitle ── */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#171717",
          }}
        >
          <span>{character?.name || "Character"}</span>
          {ageLabel ? (
            <span
              style={{
                fontWeight: 400,
                marginLeft: 8,
                color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)",
              }}
            >
              {ageLabel}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 12.5,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* ── Circular action buttons row ── */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <DetailActionCircle
          icon="chat"
          label={isOpening ? "Opening..." : "Chat"}
          isDark={isDark}
          onClick={() => onOpenChat && onOpenChat(character)}
          disabled={isOpening}
        />
        {onRemove ? (
          <DetailActionCircle
            icon="close"
            label={isRemoving ? "..." : "Unfollow"}
            color={isDark ? "rgba(255,140,140,0.8)" : "rgba(180,40,40,0.7)"}
            isDark={isDark}
            onClick={() => onRemove(character)}
            disabled={isRemoving}
          />
        ) : null}
      </div>

      {/* ── Error message ── */}
      {openError ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 11.5,
            fontFamily: FONT,
            color: isDark
              ? "rgba(255,170,170,0.9)"
              : "rgba(163,28,28,0.86)",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          {openError}
        </div>
      ) : null}

      {/* ── Grouped info sections ── */}
      {(workLabel || tags.length > 0) ? (
        <div
          style={{
            marginTop: 22,
            width: "100%",
            borderRadius: 10,
            background: groupBg,
            overflow: "hidden",
          }}
        >
          {workLabel ? (
            <div style={{ padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                Work
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.65)",
                  lineHeight: 1.6,
                }}
              >
                {workLabel}
              </div>
            </div>
          ) : null}

          {workLabel && tags.length > 0 ? (
            <div style={{ height: 1, background: dividerColor, marginLeft: 16 }} />
          ) : null}

          {tags.length > 0 ? (
            <div style={{ padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                Traits
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: FONT,
                      color: isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.58)",
                      background: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Swipe stack — pure CSS transitions, no external animation libs                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SWIPE_THRESHOLD = 80;
const FLY_OUT_X = 1400;
const FLY_OUT_MS = 500;
const SNAP_BACK_MS = 450;
const NEXT_SCALE_UP_MS = 500;

/* spring-like overshoot curve for snappy elastic feel */
const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/* smooth decel for fly-out */
const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";
/* gentle settle for snap-back */
const EASE_OUT_QUINT = "cubic-bezier(0.22, 1, 0.36, 1)";

/* ── Card content (shared between states) ── */

const SwipeCardContent = ({ character, isDark, dragX }) => {
  const [imageBroken, setImageBroken] = useState(false);
  const avatarSrc = resolveAvatarSrc(character);
  const showImage = Boolean(avatarSrc) && !imageBroken;
  const tags = listTagsForCharacter(character);
  const ageLabel = ageLabelForCharacter(character);
  const subtitle = subtitleForCharacter(character);
  const blurb =
    typeof character?.metadata?.list_blurb === "string"
      ? character.metadata.list_blurb.trim()
      : "";

  const absDrag = Math.abs(dragX);
  const likeOpacity = dragX > 0 ? Math.min(0.55, (absDrag / SWIPE_THRESHOLD) * 0.55) : 0;
  const nopeOpacity = dragX < 0 ? Math.min(0.55, (absDrag / SWIPE_THRESHOLD) * 0.55) : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        borderRadius: 7,
        overflow: "hidden",
        background: isDark ? "#1a1a1a" : "#ffffff",
        boxShadow: "0 18px 50px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.15)",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Left: Image ── */}
      <div
        style={{
          aspectRatio: "1 / 1",
          height: "100%",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: showImage
            ? "#2a2a2a"
            : "linear-gradient(145deg, #3a3d42 0%, #2a2d30 44%, #1a1d20 100%)",
        }}
      >
        {showImage ? (
          <img
            src={avatarSrc}
            alt={character?.name || "character"}
            onError={() => setImageBroken(true)}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.7)",
              fontSize: 72,
              fontWeight: 700,
              fontFamily: "NunitoSans, sans-serif",
            }}
          >
            {fallbackInitial(character)}
          </div>
        )}

        {/* Bottom gradient overlay with name */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "48px 20px 18px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              fontFamily: "NunitoSans, sans-serif",
              textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            {character?.name || "Character"}
            {ageLabel ? (
              <span style={{ fontWeight: 400, marginLeft: 8 }}>{ageLabel}</span>
            ) : null}
          </div>
        </div>

        {/* LIKE full overlay */}
        <div
          data-overlay="like"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(74,222,128,0.85), rgba(34,197,94,0.7))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: likeOpacity,
            pointerEvents: "none",
            transition: absDrag === 0 ? `opacity 0.25s ${EASE_OUT_QUINT}` : "none",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon src="heart" style={{ width: 28, height: 28 }} color="#fff" />
          </div>
          <div style={{
            color: "#fff", fontSize: 22, fontWeight: 800,
            fontFamily: "NunitoSans, sans-serif", letterSpacing: 4,
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            LIKE
          </div>
        </div>

        {/* NOPE full overlay */}
        <div
          data-overlay="nope"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(248,113,113,0.85), rgba(239,68,68,0.7))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: nopeOpacity,
            pointerEvents: "none",
            transition: absDrag === 0 ? `opacity 0.25s ${EASE_OUT_QUINT}` : "none",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon src="close" style={{ width: 26, height: 26 }} color="#fff" />
          </div>
          <div style={{
            color: "#fff", fontSize: 22, fontWeight: 800,
            fontFamily: "NunitoSans, sans-serif", letterSpacing: 4,
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            NOPE
          </div>
        </div>
      </div>

      {/* ── Right: Info ── */}
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "24px 22px 20px", minWidth: 0, overflow: "hidden",
        }}
      >
        {subtitle ? (
          <div style={{
            fontSize: 12, fontWeight: 500, fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {subtitle}
          </div>
        ) : null}

        <div style={{
          fontSize: 20, fontWeight: 700, fontFamily: "NunitoSans, sans-serif",
          color: isDark ? "#fff" : "#171717", lineHeight: 1.2,
        }}>
          {character?.name || "Character"}
          {ageLabel ? (
            <span style={{
              fontWeight: 400, marginLeft: 8,
              color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
            }}>
              {ageLabel}
            </span>
          ) : null}
        </div>

        {blurb ? (
          <div style={{
            marginTop: 16, fontSize: 13, fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.6)",
            lineHeight: 1.6, display: "-webkit-box",
            WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {blurb}
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tags.slice(0, 6).map((tag) => (
              <span key={tag} style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                fontFamily: FONT,
                color: isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.6)",
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              }}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        <div style={{
          fontSize: 11, fontFamily: FONT,
          color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
          textAlign: "center", marginTop: 8,
        }}>
          Drag or use buttons below
        </div>
      </div>
    </div>
  );
};

/* ── SwipeStack ── */

const SwipeStack = ({ characters, isDark, onSwipeRight, onSwipeLeft }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  /* drag state — not in React state to avoid re-renders during drag */
  const dragRef = useRef({ active: false, startX: 0, dx: 0 });
  const cardRef = useRef(null);

  const timerRef = useRef(null);
  const currentIndexRef = useRef(0);

  /* keep refs in sync */
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  /* cleanup */
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  /* Apply drag transform directly to DOM (no re-render during drag) */
  const applyDrag = useCallback((dx, animate) => {
    const el = cardRef.current;
    if (!el) return;
    const rot = dx / 30;
    if (animate) {
      el.style.transition = `transform ${SNAP_BACK_MS}ms ${EASE_OUT_BACK}`;
    } else {
      el.style.transition = "none";
    }
    el.style.transform = `translate3d(${dx}px, 0, 0) rotate(${rot}deg)`;

    /* update overlay opacities */
    const likeEl = el.querySelector("[data-overlay='like']");
    const nopeEl = el.querySelector("[data-overlay='nope']");
    const likeOp = dx > 0 ? Math.min(0.55, (Math.abs(dx) / SWIPE_THRESHOLD) * 0.55) : 0;
    const nopeOp = dx < 0 ? Math.min(0.55, (Math.abs(dx) / SWIPE_THRESHOLD) * 0.55) : 0;
    if (likeEl) likeEl.style.opacity = likeOp;
    if (nopeEl) nopeEl.style.opacity = nopeOp;
  }, []);

  /* track all currently flying-out cards */
  const flyingRef = useRef([]);
  const [, forceRender] = useState(0);

  const triggerSwipe = useCallback((dir) => {
    const i = currentIndexRef.current;
    if (i >= characters.length) return;
    const character = characters[i];
    if (!character) return;

    dragRef.current.dx = 0;

    /* add to flying list */
    const flyEntry = { index: i, dir, character };
    flyingRef.current = [...flyingRef.current, flyEntry];

    const nextIdx = i + 1;
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    forceRender((n) => n + 1);

    setTimeout(() => {
      flyingRef.current = flyingRef.current.filter((e) => e !== flyEntry);
      forceRender((n) => n + 1);
      if (dir > 0) {
        onSwipeRight && onSwipeRight(character);
      } else {
        onSwipeLeft && onSwipeLeft(character);
      }
    }, FLY_OUT_MS + 50);
  }, [characters, onSwipeRight, onSwipeLeft]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dx = dx;
    applyDrag(dx, false);
  }, [applyDrag]);

  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (!dragRef.current.active) return;
    const { dx } = dragRef.current;
    dragRef.current.active = false;

    const el = cardRef.current;
    if (el) el.style.cursor = "grab";

    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const dir = dx > 0 ? 1 : -1;
      dragRef.current.dx = 0;
      triggerSwipe(dir);
    } else {
      dragRef.current.dx = 0;
      applyDrag(0, true);
    }
  }, [applyDrag, triggerSwipe, onPointerMove]);

  /* mouse handlers for drag */
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, dx: 0 };
    const el = cardRef.current;
    if (el) el.style.cursor = "grabbing";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const allGone = currentIndex >= characters.length && flyingRef.current.length === 0;

  /* ── Come back later ── */
  if (allGone) {
    return (
      <div
        data-testid="characters-find-empty-swipe"
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 16, padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 32 }}>&#9749;</span>
        </div>
        <div style={{
          fontSize: 18, fontWeight: 700, fontFamily: "NunitoSans, sans-serif",
          color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)",
        }}>
          You've seen everyone!
        </div>
        <div style={{
          fontSize: 13, fontFamily: FONT,
          color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
          maxWidth: 280, lineHeight: 1.6,
        }}>
          Come back later for new characters. We're always adding new faces.
        </div>
        <Button
          label="Start Over"
          onClick={() => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
            flyingRef.current = [];
            currentIndexRef.current = 0;
            setCurrentIndex(0);
            forceRender((n) => n + 1);
          }}
          style={{
            marginTop: 8, fontSize: 13, fontWeight: 600,
            paddingVertical: 8, paddingHorizontal: 20,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          }}
        />
      </div>
    );
  }

  /* Render: all flying-out cards + current + next behind */
  const flyingIndices = new Set(flyingRef.current.map((e) => e.index));
  const visibleCards = [];
  for (const entry of flyingRef.current) {
    visibleCards.push({ index: entry.index, role: "leaving", dir: entry.dir });
  }
  for (let offset = 0; offset <= 2; offset++) {
    const idx = currentIndex + offset;
    if (idx >= characters.length) break;
    if (flyingIndices.has(idx)) continue;
    visibleCards.push({ index: idx, role: offset === 0 ? "top" : `behind-${offset}`, dir: 0 });
  }

  return (
    <div
      data-testid="characters-find-panel"
      style={{
        display: "flex", flexDirection: "column",
        height: "100%", alignItems: "center",
      }}
    >
      {/* ── Card stack ── */}
      <div
        style={{
          flex: 1, width: "100%", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "12px 24px 0",
        }}
      >
        {visibleCards.map(({ index: idx, role, dir }) => {
          const character = characters[idx];
          const isTop = role === "top";
          const isLeaving = role === "leaving";
          const behindMatch = role.match(/^behind-(\d+)$/);
          const behindOffset = behindMatch ? Number(behindMatch[1]) : 0;

          /* z-index: leaving on top, then top, then behind */
          const zIndex = isLeaving ? 100 : isTop ? 99 : 98 - behindOffset;

          /* compute transform + transition */
          let transform;
          let transition;
          let opacity = 1;

          if (isLeaving) {
            transform = `translate3d(${dir * FLY_OUT_X}px, -60px, 0) rotate(${dir * 14}deg)`;
            transition = `transform ${FLY_OUT_MS}ms ${EASE_OUT_EXPO}, opacity ${FLY_OUT_MS * 0.8}ms ${EASE_OUT_EXPO}`;
            opacity = 0;
          } else if (isTop) {
            /* controlled by pointer events, default to identity */
            transform = "translate3d(0, 0, 0) rotate(0deg)";
            transition = "none";
          } else {
            /* behind cards: slightly smaller, offset down — peek out more */
            const s = 1 - behindOffset * 0.04;
            const y = behindOffset * 18;
            transform = `translate3d(0, ${y}px, 0) scale(${s})`;
            transition = `transform ${NEXT_SCALE_UP_MS}ms ${EASE_OUT_BACK}`;
          }

          /* dragX for overlay — only the top card during drag */
          const dragX = isTop ? dragRef.current.dx : 0;

          return (
            <div
              key={character?.id || `swipe-${idx}`}
              ref={isTop ? cardRef : undefined}
              data-testid={`swipe-card-${character?.id || idx}`}
              onPointerDown={isTop ? onPointerDown : undefined}
              style={{
                position: "absolute",
                width: "92%",
                maxWidth: 720,
                height: "88%",
                willChange: "transform, opacity",
                zIndex,
                touchAction: "none",
                cursor: isTop ? "grab" : "default",
                pointerEvents: isTop ? "auto" : "none",
                transform,
                transition,
                opacity,
              }}
            >
              <SwipeCardContent
                character={character}
                isDark={isDark}
                dragX={dragX}
              />
            </div>
          );
        })}
      </div>

      {/* ── Action buttons ── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 8, padding: "12px 0 16px", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 28,
        }}>
          <button
            type="button"
            onClick={() => triggerSwipe(-1)}
            style={{
              width: 52, height: 52, borderRadius: "50%", border: "none",
              background: "#ef4444", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", boxShadow: "none",
              transition: `transform 0.25s ${EASE_OUT_BACK}, box-shadow 0.2s ease`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(239,68,68,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <Icon src="close" style={{ width: 22, height: 22 }} color="#fff" />
          </button>

          <button
            type="button"
            onClick={() => triggerSwipe(1)}
            style={{
              width: 52, height: 52, borderRadius: "50%", border: "none",
              background: "#22c55e", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", boxShadow: "none",
              transition: `transform 0.25s ${EASE_OUT_BACK}, box-shadow 0.2s ease`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(34,197,94,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <Icon src="heart_outline" style={{ width: 24, height: 24 }} color="#fff" />
          </button>
        </div>

        <div style={{
          fontSize: 11, fontFamily: FONT,
          color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
        }}>
          {currentIndex + 1} / {characters.length}
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  FindCharactersPanel — loads seed characters, renders SwipeStack                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const FindCharactersPanel = ({ isDark, addedIds, onAdd }) => {
  const [status, setStatus] = useState("loading");
  const [characters, setCharacters] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  /* Keep the full list stable so the swipe stack doesn't reset mid-animation.
   * The stack manages its own "gone" state for cards that have been swiped. */
  const discoverCharacters = characters;

  useEffect(() => {
    let cancelled = false;

    const loadCharacters = async () => {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await api.miso.listSeedCharacters();
        if (cancelled) return;
        const nextCharacters = Array.isArray(response?.characters)
          ? response.characters
          : [];
        setCharacters(nextCharacters);
        setStatus(nextCharacters.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (cancelled) return;
        setCharacters([]);
        setStatus("error");
        setErrorMessage(
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Could not load characters right now.",
        );
      }
    };

    loadCharacters();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <CharacterStatePanel
        icon="search"
        title="Loading characters..."
        body="Discovering available characters."
        isDark={isDark}
        testId="characters-find-loading"
      />
    );
  }

  if (status === "error") {
    return (
      <CharacterStatePanel
        icon="warning"
        title="Could not load characters"
        body={errorMessage}
        isDark={isDark}
        testId="characters-find-error"
      />
    );
  }

  if (status === "empty") {
    return (
      <CharacterStatePanel
        icon="search"
        title="No characters available"
        body="There are no characters to discover right now."
        isDark={isDark}
        testId="characters-find-empty"
      />
    );
  }

  if (discoverCharacters.length === 0) {
    return (
      <CharacterStatePanel
        icon="check"
        title="You're all caught up"
        body="You're already following every character available right now."
        isDark={isDark}
        testId="characters-find-following-all"
      />
    );
  }

  return (
    <SwipeStack
      characters={discoverCharacters}
      isDark={isDark}
      onSwipeRight={(character) => {
        if (!addedIds.has(character?.id)) {
          onAdd && onAdd(character);
        }
      }}
      onSwipeLeft={() => {}}
    />
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  AddedCharactersPanel — master-detail container                                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const AddedCharactersPanel = ({
  isDark,
  onOpenChat: onOpenChatSuccess,
  characters,
  onRemove,
  removingId,
}) => {
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [openingCharacterId, setOpeningCharacterId] = useState("");
  const [openErrorById, setOpenErrorById] = useState({});

  /* auto-select first when list changes */
  useEffect(() => {
    if (
      characters.length > 0 &&
      !characters.find((c) => c?.id === selectedCharacterId)
    ) {
      setSelectedCharacterId(characters[0]?.id || "");
    }
  }, [characters, selectedCharacterId]);

  const handleOpenChat = async (character) => {
    const characterId = typeof character?.id === "string" ? character.id.trim() : "";
    if (!characterId) return;

    setOpeningCharacterId(characterId);
    setOpenErrorById((current) => ({ ...current, [characterId]: "" }));

    try {
      const result = openCharacterChat(
        {
          character,
          sourceModelId: resolveSourceModelIdFromStore(),
        },
        { source: "characters-page" },
      );

      if (result?.ok !== true) {
        throw new Error(
          typeof result?.error === "string" && result.error.trim()
            ? result.error.trim()
            : "Could not open this character chat.",
        );
      }

      if (typeof onOpenChatSuccess === "function") {
        onOpenChatSuccess(result);
      }
    } catch (error) {
      setOpenErrorById((current) => ({
        ...current,
        [characterId]:
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Could not open this character chat.",
      }));
    } finally {
      setOpeningCharacterId("");
    }
  };

  if (characters.length === 0) {
    return (
      <CharacterStatePanel
        icon="user"
        title="Not following any characters yet"
        body='Switch to the "Discover" tab to discover and follow characters.'
        isDark={isDark}
        testId="characters-added-empty"
      />
    );
  }

  const selectedCharacter = characters.find(
    (c) => c?.id === selectedCharacterId,
  ) || null;

  return (
    <div
      data-testid="characters-added-list"
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        gap: 16,
        padding: "12px 0 8px 8px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Left: Contact List ────────────────────────── */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          minWidth: 0,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.035)"
            : "rgba(255,255,255,0.82)",
          borderRadius: 7,
          display: "flex",
          flexDirection: "column",
          padding: "10px",
          overflow: "hidden",
        }}
      >
        <div
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            paddingRight: 2,
            paddingBottom: 2,
          }}
        >
          {characters.map((character, index) => (
            <CharacterContactRow
              key={character?.id || character?.name || `character-${index}`}
              character={character}
              isDark={isDark}
              isSelected={selectedCharacterId === character?.id}
              onClick={(c) => setSelectedCharacterId(c?.id || "")}
              onOpenChat={handleOpenChat}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Detail Panel ───────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
        }}
      >
        <div
          data-testid="character-detail-scroll-region"
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 6,
            paddingBottom: 10,
          }}
        >
          <CharacterDetailPanel
            character={selectedCharacter}
            isDark={isDark}
            onOpenChat={handleOpenChat}
            isOpening={
              selectedCharacter
                ? openingCharacterId === selectedCharacter.id
                : false
            }
            openError={
              selectedCharacter
                ? openErrorById[selectedCharacter.id] || ""
                : ""
            }
            onRemove={onRemove}
            isRemoving={
              selectedCharacter
                ? removingId === selectedCharacter.id
                : false
            }
          />
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  CharactersPage — tab wrapper (state lifted here)                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CharactersPage = ({ isDark, onOpenChat }) => {
  const [activeTab, setActiveTab] = useState("added");

  /* ── Shared character list state (single source of truth) ── */
  const [status, setStatus] = useState("loading");
  const [characters, setCharacters] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setAddingId] = useState("");
  const [removingId, setRemovingId] = useState("");

  const fetchCharacters = useCallback(async () => {
    const response = await api.miso.listCharacters();
    return Array.isArray(response?.characters) ? response.characters : [];
  }, []);

  const loadCharacters = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const nextCharacters = await fetchCharacters();
      setCharacters(nextCharacters);
      setStatus(nextCharacters.length > 0 ? "ready" : "empty");
    } catch (error) {
      setCharacters([]);
      setStatus("error");
      setErrorMessage(
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Could not load characters right now.",
      );
    }
  }, [fetchCharacters]);

  const refreshCharacters = useCallback(async () => {
    try {
      const nextCharacters = await fetchCharacters();
      setCharacters(nextCharacters);
      setStatus(nextCharacters.length > 0 ? "ready" : "empty");
      return true;
    } catch {
      return false;
    }
  }, [fetchCharacters]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const addedIds = useMemo(
    () => new Set(characters.map((c) => c?.id).filter(Boolean)),
    [characters],
  );

  /* ── Add character (from Discover → Added) ── */
  const handleAdd = useCallback(
    async (character) => {
      const id = character?.id;
      if (!id || addedIds.has(id)) return;
      setAddingId(id);
      try {
        /* Save character via API so it appears in "Added" */
        await api.miso.saveCharacter(character);
        await refreshCharacters();
      } catch {
        /* silently fail — card stays un-added */
      } finally {
        setAddingId("");
      }
    },
    [addedIds, refreshCharacters],
  );

  /* ── Remove character (from Added) ── */
  const handleRemove = useCallback(
    async (character) => {
      const id = character?.id;
      if (!id) return;
      setRemovingId(id);
      try {
        await api.miso.deleteCharacter(id);
        await refreshCharacters();
      } catch {
        /* silently fail */
      } finally {
        setRemovingId("");
      }
    },
    [refreshCharacters],
  );

  const TabItem = ({ item }) => {
    const isActive = activeTab === item.key;
    return (
      <Button
        prefix_icon={item.icon}
        label={item.label}
        onClick={() => setActiveTab(item.key)}
        style={{
          fontSize: 12,
          fontWeight: 500,
          opacity: isActive ? 1 : 0.5,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: 8,
          gap: 5,
          content: {
            icon: { width: 14, height: 14 },
          },
        }}
      />
    );
  };

  const renderContent = () => {
    if (status === "loading") {
      return (
        <CharacterStatePanel
          icon="check"
          title="Loading characters..."
          body="Pulling character data from the runtime."
          isDark={isDark}
          testId="characters-loading"
        />
      );
    }

    if (status === "error") {
      return (
        <CharacterStatePanel
          icon="warning"
          title="Could not load characters"
          body={errorMessage}
          isDark={isDark}
          testId="characters-error"
        />
      );
    }

    if (activeTab === "added") {
      return (
        <AddedCharactersPanel
          isDark={isDark}
          onOpenChat={onOpenChat}
          characters={characters}
          onRemove={handleRemove}
          removingId={removingId}
        />
      );
    }

    if (activeTab === "find") {
      return (
        <FindCharactersPanel
          isDark={isDark}
          addedIds={addedIds}
          onAdd={handleAdd}
        />
      );
    }

    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 16px 8px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
          flexShrink: 0,
        }}
      >
        {CHARACTER_SUB_PAGES.map((item) => (
          <TabItem key={item.key} item={item} />
        ))}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
};

export default CharactersPage;
