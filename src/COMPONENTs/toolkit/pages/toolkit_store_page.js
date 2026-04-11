import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import PlaceholderBlock from "../components/placeholder_block";

const ToolkitStorePage = ({ isDark }) => {
  const { t } = useTranslation();
  return (
    <PlaceholderBlock
      icon="search"
      title={t("toolkit.store_title")}
      subtitle={t("toolkit.store_subtitle")}
      isDark={isDark}
    />
  );
};

export default ToolkitStorePage;
