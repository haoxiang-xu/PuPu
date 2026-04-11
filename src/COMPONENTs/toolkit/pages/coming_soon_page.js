import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import PlaceholderBlock from "../components/placeholder_block";

const ComingSoonPage = ({ icon, isDark }) => {
  const { t } = useTranslation();
  return (
    <PlaceholderBlock
      icon={icon}
      title={t("toolkit.coming_soon_title")}
      subtitle={t("toolkit.coming_soon_subtitle")}
      isDark={isDark}
    />
  );
};

export default ComingSoonPage;
