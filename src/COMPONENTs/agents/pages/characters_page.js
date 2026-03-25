import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { getChatsStore, openCharacterChat } from "../../../SERVICEs/chat_storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const CHARACTER_SUB_PAGES = [
  { key: "added", icon: "check", label: "Added" },
  { key: "find", icon: "search", label: "Find" },
];

/* ── Character source types (extensible for future store/community) ── */
const CHARACTER_SOURCES = {
  SEED: "seed",
  // COMMUNITY: "community",
  // STORE: "store",
};

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
  const subtitle = subtitleForCharacter(character);

  const bg = isSelected
    ? isDark
      ? "rgba(255,255,255,0.10)"
      : "rgba(0,0,0,0.082)"
    : hovered
      ? isDark
        ? "rgba(255,255,255,0.07)"
        : "rgba(0,0,0,0.055)"
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
        height: 56,
        padding: "0 12px",
        margin: "1px 4px",
        borderRadius: 8,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        background: bg,
        transition: "background 0.15s ease",
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
        {subtitle ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 11.5,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {hovered && onOpenChat ? (
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
            opacity: 0.6,
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

const CharacterDetailPanel = ({
  character,
  isDark,
  onOpenChat,
  isOpening,
  openError,
  onRemove,
  isRemoving,
}) => {
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

  return (
    <div
      data-testid={`character-detail-${character?.id || "unknown"}`}
      className="scrollable"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        padding: "32px 32px 24px",
      }}
    >
      {/* ── Header (centered) ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        <CharacterAvatar character={character} isDark={isDark} size={72} />

        <div
          style={{
            marginTop: 16,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#171717",
            textAlign: "center",
          }}
        >
          {character?.name || "Character"}
        </div>

        {subtitle ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.5)",
              textAlign: "center",
            }}
          >
            {subtitle}
          </div>
        ) : null}

        {ageLabel ? (
          <div
            style={{
              marginTop: 10,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.65)",
              background: isDark
                ? "rgba(255,255,255,0.07)"
                : "rgba(0,0,0,0.05)",
            }}
          >
            {ageLabel}
          </div>
        ) : null}
      </div>

      {/* ── Body ──────────────────────────────────────── */}
      {(blurb || tags.length > 0) && (
        <div
          style={{
            marginTop: 24,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {blurb ? (
            <div
              style={{
                fontSize: 13,
                fontFamily: FONT,
                color: isDark
                  ? "rgba(255,255,255,0.72)"
                  : "rgba(0,0,0,0.68)",
                lineHeight: 1.65,
              }}
            >
              {blurb}
            </div>
          ) : null}

          {tags.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: FONT,
                    color: isDark
                      ? "rgba(255,255,255,0.8)"
                      : "rgba(0,0,0,0.66)",
                    background: isDark
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(0,0,0,0.05)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Spacer ────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 24 }} />

      {/* ── Actions ───────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Button
          label={isOpening ? "Opening..." : "Open Chat"}
          onClick={() => onOpenChat && onOpenChat(character)}
          disabled={isOpening}
          style={{
            fontSize: 13,
            fontWeight: 600,
            paddingVertical: 8,
            paddingHorizontal: 20,
            borderRadius: 999,
          }}
        />
        {onRemove ? (
          <Button
            prefix_icon="delete"
            label={isRemoving ? "Removing..." : "Remove"}
            onClick={() => onRemove(character)}
            disabled={isRemoving}
            style={{
              fontSize: 12,
              fontWeight: 500,
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 999,
              opacity: 0.6,
              color: isDark ? "rgba(255,140,140,0.9)" : "rgba(180,40,40,0.8)",
              hoverBackgroundColor: isDark
                ? "rgba(255,100,100,0.12)"
                : "rgba(200,40,40,0.08)",
              content: {
                icon: { width: 14, height: 14 },
              },
            }}
          />
        ) : null}
        {openError ? (
          <div
            style={{
              minWidth: 0,
              flex: 1,
              fontSize: 11.5,
              fontFamily: FONT,
              color: isDark
                ? "rgba(255,170,170,0.9)"
                : "rgba(163,28,28,0.86)",
              lineHeight: 1.45,
            }}
          >
            {openError}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Find: Character Card (grid item)                                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CharacterCard = ({ character, isDark, isAdded, onAdd, isAdding }) => {
  const [hovered, setHovered] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const tags = listTagsForCharacter(character);
  const subtitle = subtitleForCharacter(character);
  const blurb =
    typeof character?.metadata?.list_blurb === "string"
      ? character.metadata.list_blurb.trim()
      : "";
  const avatarSrc = resolveAvatarSrc(character);
  const showHeroImage = Boolean(avatarSrc) && !imageBroken;
  const ageLabel = ageLabelForCharacter(character);
  const primaryStat = ageLabel ? `${ageLabel} Years` : "Ready to chat";
  const secondaryStat =
    tags.length > 0 ? `${tags.length} Traits` : subtitle ? "Profile" : "New";

  return (
    <div
      data-testid={`find-card-${character?.id || "unknown"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 7,
        padding: 12,
        overflow: "hidden",
        background: isDark ? "#141414" : "#ffffff",
        border: hovered
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid rgba(255,255,255,0.08)",
        transition:
          "transform 0.16s ease, box-shadow 0.2s ease, border-color 0.16s ease",
        boxShadow: hovered
          ? "0 14px 30px rgba(0,0,0,0.26)"
          : "0 8px 18px rgba(0,0,0,0.16)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        cursor: "default",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          minHeight: 0,
          borderRadius: 7,
          overflow: "hidden",
          background: showHeroImage
            ? "#ccd1d4"
            : "linear-gradient(145deg, #d8dddf 0%, #c2c7ca 44%, #83868b 100%)",
          border: "1px solid rgba(255,255,255,0.14)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {showHeroImage ? (
          <img
            src={avatarSrc}
            alt={`${character?.name || "character"} hero`}
            onError={() => setImageBroken(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
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
              color: "rgba(255,255,255,0.88)",
              fontSize: 48,
              fontWeight: 700,
              fontFamily: "NunitoSans, sans-serif",
            }}
          >
            {fallbackInitial(character)}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "14px 4px 2px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1,
              fontSize: 18,
              fontWeight: 400,
              fontFamily: "NunitoSans, sans-serif",
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {character?.name || "Character"}
          </div>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1.5px solid rgba(255,255,255,0.72)",
              color: "rgba(255,255,255,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <Icon
              src="verified"
              style={{ width: 15, height: 15 }}
              color="rgba(255,255,255,0.92)"
            />
          </div>
        </div>

        {(blurb || subtitle) ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              fontFamily: FONT,
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: 32,
            }}
          >
            {blurb || subtitle}
          </div>
        ) : (
          <div style={{ minHeight: 32 }} />
        )}

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 14,
              color: "rgba(255,255,255,0.86)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 400,
                fontFamily: FONT,
                whiteSpace: "nowrap",
              }}
            >
              {primaryStat}
            </div>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 400,
                fontFamily: FONT,
                whiteSpace: "nowrap",
              }}
            >
              {secondaryStat}
            </div>
          </div>

          {isAdded ? (
            <button
              type="button"
              disabled
              style={{
                height: 40,
                minWidth: 120,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.74)",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "NunitoSans, sans-serif",
                boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
              }}
            >
              Added
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAdd && onAdd(character)}
              disabled={isAdding}
              style={{
                height: 40,
                minWidth: 126,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: hovered
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: "NunitoSans, sans-serif",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: hovered
                  ? "0 8px 18px rgba(0,0,0,0.16)"
                  : "0 4px 10px rgba(0,0,0,0.1)",
                cursor: isAdding ? "progress" : "pointer",
                flexShrink: 0,
              }}
            >
              <span>{isAdding ? "Adding..." : "Follow"}</span>
              <div
                style={{
                  position: "relative",
                  width: 16,
                  height: 16,
                  opacity: 0.9,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 2,
                    top: 1,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    border: "1.5px solid currentColor",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 9,
                    width: 11,
                    height: 6,
                    borderRadius: "7px 7px 5px 5px",
                    border: "1.5px solid currentColor",
                    borderTop: "none",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 5,
                    width: 8,
                    height: 8,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 0,
                      width: 1.5,
                      height: 8,
                      background: "currentColor",
                      transform: "translateX(-50%)",
                      borderRadius: 999,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      width: 8,
                      height: 1.5,
                      background: "currentColor",
                      transform: "translateY(-50%)",
                      borderRadius: 999,
                    }}
                  />
                </span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  FindCharactersPanel — card grid with search                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const FindCharactersPanel = ({ isDark, addedIds, onAdd, addingId }) => {
  const [status, setStatus] = useState("loading");
  const [characters, setCharacters] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCharacters = async () => {
      setStatus("loading");
      setErrorMessage("");

      try {
        /* Load seed characters from the dedicated seeds endpoint.
         * Future: switch source based on active source tab
         *   e.g. api.store.listCharacters(), api.community.listCharacters()
         */
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

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase().trim();
    return characters.filter((c) => {
      const name = (c?.name || "").toLowerCase();
      const role = (c?.role || "").toLowerCase();
      const blurb = (c?.metadata?.list_blurb || "").toLowerCase();
      const tags = (c?.metadata?.list_tags || []).join(" ").toLowerCase();
      return (
        name.includes(q) ||
        role.includes(q) ||
        blurb.includes(q) ||
        tags.includes(q)
      );
    });
  }, [characters, searchQuery]);

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
    <div
      data-testid="characters-find-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* ── Search Bar ────────────────────────────────── */}
      <div style={{ padding: "12px 20px 8px", flexShrink: 0 }}>
        <Input
          prefix_icon="search"
          placeholder="Search characters..."
          value={searchQuery}
          set_value={setSearchQuery}
          style={{
            width: "100%",
            fontSize: 13,
            borderRadius: 10,
            paddingVertical: 7,
            paddingHorizontal: 12,
          }}
        />
      </div>

      {/* ── Card Grid ─────────────────────────────────── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 20px 20px",
        }}
      >
        {filteredCharacters.length === 0 ? (
          <CharacterStatePanel
            icon="search"
            title="No results"
            body={`No characters match "${searchQuery}".`}
            isDark={isDark}
            testId="characters-find-no-results"
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
              alignItems: "start",
            }}
          >
            {filteredCharacters.map((character, index) => (
              <CharacterCard
                key={character?.id || `find-${index}`}
                character={character}
                isDark={isDark}
                isAdded={addedIds.has(character?.id)}
                onAdd={onAdd}
                isAdding={addingId === character?.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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
        title="No characters added yet"
        body='Switch to the "Find" tab to discover and add characters.'
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
      }}
    >
      {/* ── Left: Contact List ────────────────────────── */}
      <div
        className="scrollable"
        style={{
          width: 260,
          flexShrink: 0,
          overflowY: "auto",
          borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          padding: "6px 0",
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

      {/* ── Right: Detail Panel ───────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
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

  /* ── Add character (from Find → Added) ── */
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
