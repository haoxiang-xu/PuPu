import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSprings, animated, to as interpolate } from "react-spring";
import { useDrag } from "@use-gesture/react";
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

/* ── Circular action button for detail panel ── */
const DetailActionCircle = ({ icon, label, color, isDark, onClick, disabled }) => {
  const [hovered, setHovered] = useState(false);
  const baseColor = color || (isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)");

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: "none",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: isDark
            ? hovered ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"
            : hovered ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s ease, transform 0.15s ease",
          transform: hovered ? "scale(1.08)" : "scale(1)",
        }}
      >
        <Icon src={icon} style={{ width: 19, height: 19 }} color={baseColor} />
      </div>
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
    </button>
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
  const blurb =
    typeof character?.metadata?.list_blurb === "string"
      ? character.metadata.list_blurb.trim()
      : "";
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
      {(blurb || tags.length > 0) ? (
        <div
          style={{
            marginTop: 22,
            width: "100%",
            borderRadius: 10,
            background: groupBg,
            overflow: "hidden",
          }}
        >
          {blurb ? (
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
                About
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.65)",
                  lineHeight: 1.6,
                }}
              >
                {blurb}
              </div>
            </div>
          ) : null}

          {blurb && tags.length > 0 ? (
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
/*  Swipe card helpers                                                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SWIPE_THRESHOLD = 100;
const SWIPE_VELOCITY = 0.4;
const FLY_OUT_DISTANCE = 1200;

const toSpring = (i, gone, currentIndex) => {
  if (gone.has(i)) {
    const dir = gone.get(i);
    return {
      x: dir * FLY_OUT_DISTANCE,
      rot: dir * 15,
      scale: 0.9,
      opacity: 0,
      config: { friction: 50, tension: 200 },
    };
  }
  const offset = i - currentIndex;
  return {
    x: 0,
    rot: 0,
    scale: offset === 0 ? 1 : 1 - offset * 0.04,
    opacity: offset <= 2 ? 1 : 0,
    y: offset * 8,
    config: { friction: 28, tension: 180 },
  };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SwipeCard — single unified card (left image + right info)                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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

  const likeOpacity = dragX
    ? dragX.to((x) => Math.min(0.55, Math.max(0, (x / SWIPE_THRESHOLD) * 0.55)))
    : 0;
  const nopeOpacity = dragX
    ? dragX.to((x) => Math.min(0.55, Math.max(0, (-x / SWIPE_THRESHOLD) * 0.55)))
    : 0;

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
        <animated.div
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
          }}
        >
          <div style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Icon src="heart" style={{ width: 28, height: 28 }} color="#fff" />
          </div>
          <div style={{
            color: "#fff",
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "NunitoSans, sans-serif",
            letterSpacing: 4,
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            LIKE
          </div>
        </animated.div>

        {/* NOPE full overlay */}
        <animated.div
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
          }}
        >
          <div style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Icon src="close" style={{ width: 26, height: 26 }} color="#fff" />
          </div>
          <div style={{
            color: "#fff",
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "NunitoSans, sans-serif",
            letterSpacing: 4,
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            NOPE
          </div>
        </animated.div>
      </div>

      {/* ── Right: Info ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px 22px 20px",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {subtitle ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {subtitle}
          </div>
        ) : null}

        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#171717",
            lineHeight: 1.2,
          }}
        >
          {character?.name || "Character"}
          {ageLabel ? (
            <span
              style={{
                fontWeight: 400,
                marginLeft: 8,
                color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
              }}
            >
              {ageLabel}
            </span>
          ) : null}
        </div>

        {blurb ? (
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.6)",
              lineHeight: 1.6,
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {blurb}
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.6)",
                  background: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        <div
          style={{
            fontSize: 11,
            fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Drag or use buttons below
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SwipeStack — Tinder-style stacked cards with drag                                                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SwipeStack = ({ characters, isDark, onSwipeRight, onSwipeLeft }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const goneRef = useRef(new Map());
  const gone = goneRef.current;

  const [springs, api] = useSprings(characters.length, (i) =>
    toSpring(i, gone, 0),
  );

  const triggerSwipe = useCallback(
    (dir) => {
      if (currentIndex >= characters.length) return;
      const i = currentIndex;
      gone.set(i, dir);

      api.start((idx) => toSpring(idx, gone, i + 1));
      setCurrentIndex(i + 1);

      if (dir > 0) {
        onSwipeRight && onSwipeRight(characters[i]);
      } else {
        onSwipeLeft && onSwipeLeft(characters[i]);
      }
    },
    [currentIndex, characters, gone, api, onSwipeRight, onSwipeLeft],
  );

  const bind = useDrag(
    ({ args: [index], active, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (index !== currentIndex) return;

      const trigger = Math.abs(mx) > SWIPE_THRESHOLD || vx > SWIPE_VELOCITY;
      const dir = dx > 0 ? 1 : -1;

      if (!active && trigger) {
        triggerSwipe(dir);
        return;
      }

      if (active) {
        api.start((i) => {
          if (i !== index) return;
          return {
            x: mx,
            rot: mx / 20,
            scale: 1,
            config: { friction: 50, tension: 800 },
          };
        });
      } else {
        api.start((i) => {
          if (i !== index) return;
          return {
            x: 0,
            rot: 0,
            scale: 1,
            config: { friction: 28, tension: 180 },
          };
        });
      }
    },
    { filterTaps: true },
  );

  const allGone = currentIndex >= characters.length;

  /* ── Come back later state ── */
  if (allGone) {
    return (
      <div
        data-testid="characters-find-empty-swipe"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 16,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 32 }}>&#9749;</span>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "NunitoSans, sans-serif",
            color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)",
          }}
        >
          You've seen everyone!
        </div>
        <div
          style={{
            fontSize: 13,
            fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
            maxWidth: 280,
            lineHeight: 1.6,
          }}
        >
          Come back later for new characters. We're always adding new faces.
        </div>
        <Button
          label="Start Over"
          onClick={() => {
            goneRef.current = new Map();
            setCurrentIndex(0);
            api.start((i) => toSpring(i, goneRef.current, 0));
          }}
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            paddingVertical: 8,
            paddingHorizontal: 20,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="characters-find-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        alignItems: "center",
      }}
    >
      {/* ── Card stack area ── */}
      <div
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 24px 0",
        }}
      >
        {springs.map((spring, i) => {
          if (i < currentIndex - 1) return null;
          const character = characters[i];
          const isTop = i === currentIndex;

          return (
            <animated.div
              key={character?.id || `swipe-${i}`}
              {...(isTop ? bind(i) : {})}
              style={{
                position: "absolute",
                width: "92%",
                maxWidth: 720,
                height: "88%",
                willChange: "transform, opacity",
                zIndex: characters.length - i,
                touchAction: "none",
                cursor: isTop ? "grab" : "default",
                x: spring.x,
                y: spring.y || 0,
                opacity: spring.opacity,
                transform: interpolate(
                  [spring.rot, spring.scale],
                  (r, s) => `rotate(${r}deg) scale(${s})`,
                ),
              }}
            >
              <SwipeCardContent
                character={character}
                isDark={isDark}
                dragX={isTop ? spring.x : null}
              />
            </animated.div>
          );
        })}
      </div>

      {/* ── Action buttons ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "12px 0 16px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
          }}
        >
          {/* Skip button — solid red glow */}
          <button
            type="button"
            onClick={() => triggerSwipe(-1)}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "none",
              background: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "none",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.12)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(239,68,68,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Icon src="close" style={{ width: 22, height: 22 }} color="#fff" />
          </button>

          {/* Follow / Add button — solid green glow */}
          <button
            type="button"
            onClick={() => triggerSwipe(1)}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "none",
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "none",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.12)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(34,197,94,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Icon src="heart_outline" style={{ width: 24, height: 24 }} color="#fff" />
          </button>
        </div>

        {/* Counter */}
        <div
          style={{
            fontSize: 11,
            fontFamily: FONT,
            color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
          }}
        >
          {currentIndex + 1} / {characters.length}
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  FindCharactersPanel — loads seed characters, renders SwipeStack                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const FindCharactersPanel = ({ isDark, addedIds, onAdd, addingId }) => {
  const [status, setStatus] = useState("loading");
  const [characters, setCharacters] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

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

  return (
    <SwipeStack
      characters={characters}
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
  const [addingId, setAddingId] = useState("");
  const [removingId, setRemovingId] = useState("");

  const loadCharacters = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await api.miso.listCharacters();
      const nextCharacters = Array.isArray(response?.characters)
        ? response.characters
        : [];
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
  }, []);

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
        await loadCharacters();
      } catch {
        /* silently fail — card stays un-added */
      } finally {
        setAddingId("");
      }
    },
    [addedIds, loadCharacters],
  );

  /* ── Remove character (from Added) ── */
  const handleRemove = useCallback(
    async (character) => {
      const id = character?.id;
      if (!id) return;
      setRemovingId(id);
      try {
        await api.miso.deleteCharacter(id);
        await loadCharacters();
      } catch {
        /* silently fail */
      } finally {
        setRemovingId("");
      }
    },
    [loadCharacters],
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
          addingId={addingId}
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
