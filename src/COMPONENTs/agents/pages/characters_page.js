import { useEffect, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { getChatsStore, openCharacterChat } from "../../../SERVICEs/chat_storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const CHARACTER_SUB_PAGES = [
  { key: "added", icon: "check", label: "Added" },
  { key: "find", icon: "search", label: "Find" },
];

const FONT = "Jost, sans-serif";

const resolveAvatarSrc = (character) => {
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

const CharacterAvatar = ({ character, isDark }) => {
  const [imageBroken, setImageBroken] = useState(false);
  const avatarSrc = resolveAvatarSrc(character);
  const showImage = Boolean(avatarSrc) && !imageBroken;

  return (
    <div
      style={{
        width: 54,
        height: 54,
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
        fontSize: 18,
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

const CharacterCard = ({
  character,
  isDark,
  onOpenChat,
  isOpening = false,
  openError = "",
}) => {
  const tags = listTagsForCharacter(character);
  const ageLabel = ageLabelForCharacter(character);
  const blurb =
    typeof character?.metadata?.list_blurb === "string"
      ? character.metadata.list_blurb.trim()
      : "";
  const subtitle = subtitleForCharacter(character);

  return (
    <div
      data-testid={`character-card-${character?.id || "unknown"}`}
      style={{
        display: "flex",
        gap: 14,
        padding: "16px 18px",
        borderRadius: 16,
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
        background: isDark
          ? "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))"
          : "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,248,248,0.92))",
        boxShadow: isDark
          ? "0 12px 32px rgba(0,0,0,0.24)"
          : "0 10px 28px rgba(0,0,0,0.08)",
      }}
    >
      <CharacterAvatar character={character} isDark={isDark} />

      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "NunitoSans, sans-serif",
                color: isDark ? "#fff" : "#171717",
              }}
            >
              {character?.name || "Character"}
            </div>
            {subtitle ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontFamily: FONT,
                  color: isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.5)",
                  lineHeight: 1.45,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>

          {ageLabel ? (
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: FONT,
                color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.65)",
                background: isDark
                  ? "rgba(255,255,255,0.07)"
                  : "rgba(0,0,0,0.05)",
                flexShrink: 0,
              }}
            >
              {ageLabel}
            </div>
          ) : null}
        </div>

        {blurb ? (
          <div
            style={{
              fontSize: 12.5,
              fontFamily: FONT,
              color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
              lineHeight: 1.6,
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
                  color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.66)",
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 4,
          }}
        >
          <Button
            label={isOpening ? "Opening..." : "Open Chat"}
            onClick={() => onOpenChat && onOpenChat(character)}
            disabled={isOpening}
            style={{
              fontSize: 12,
              fontWeight: 600,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
            }}
          />
          {openError ? (
            <div
              style={{
                minWidth: 0,
                flex: 1,
                textAlign: "right",
                fontSize: 11.5,
                fontFamily: FONT,
                color: isDark ? "rgba(255,170,170,0.9)" : "rgba(163,28,28,0.86)",
                lineHeight: 1.45,
              }}
            >
              {openError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const AddedCharactersPanel = ({ isDark, onOpenChat: onOpenChatSuccess }) => {
  const [status, setStatus] = useState("loading");
  const [characters, setCharacters] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [openingCharacterId, setOpeningCharacterId] = useState("");
  const [openErrorById, setOpenErrorById] = useState({});

  useEffect(() => {
    let cancelled = false;

    const loadCharacters = async () => {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await api.miso.listCharacters();
        if (cancelled) {
          return;
        }
        const nextCharacters = Array.isArray(response?.characters)
          ? response.characters
          : [];
        setCharacters(nextCharacters);
        setStatus(nextCharacters.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (cancelled) {
          return;
        }
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

  const handleOpenChat = async (character) => {
    const characterId = typeof character?.id === "string" ? character.id.trim() : "";
    if (!characterId) {
      return;
    }

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

  if (status === "loading") {
    return (
      <CharacterStatePanel
        icon="check"
        title="Loading characters..."
        body="Pulling your added character list from the runtime."
        isDark={isDark}
        testId="characters-added-loading"
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
        testId="characters-added-error"
      />
    );
  }

  if (status === "empty") {
    return (
      <CharacterStatePanel
        icon="user"
        title="No characters added yet"
        body="Your added character list is empty right now."
        isDark={isDark}
        testId="characters-added-empty"
      />
    );
  }

  return (
    <div
      data-testid="characters-added-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "18px 16px 20px",
      }}
    >
      {characters.map((character, index) => (
        <CharacterCard
          key={character?.id || character?.name || `character-${index}`}
          character={character}
          isDark={isDark}
          onOpenChat={handleOpenChat}
          isOpening={openingCharacterId === character?.id}
          openError={openErrorById[character?.id] || ""}
        />
      ))}
    </div>
  );
};

const CharactersPage = ({ isDark, onOpenChat }) => {
  const [activeTab, setActiveTab] = useState("added");

  const activeItem = CHARACTER_SUB_PAGES.find((p) => p.key === activeTab);

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
    if (activeTab === "added") {
      return <AddedCharactersPanel isDark={isDark} onOpenChat={onOpenChat} />;
    }

    return (
      <CharacterStatePanel
        icon={activeItem?.icon || "user"}
        title="Coming soon"
        body="This section is not yet available."
        isDark={isDark}
        testId="characters-coming-soon"
      />
    );
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
          overflowY: activeTab === "added" ? "auto" : "hidden",
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
};

export default CharactersPage;
