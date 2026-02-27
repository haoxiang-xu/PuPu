import { useContext, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } -------------------------------------------------------------------------------------------------------------- */
import Select, {
  SinkingSelect,
  FloatingSelect,
} from "../../../BUILTIN_COMPONENTs/select/select";
import { SinkingInput } from "../../../BUILTIN_COMPONENTs/input/input";
import countries from "../../../BUILTIN_COMPONENTs/consts/countries";
/* { Components } -------------------------------------------------------------------------------------------------------------- */

const SelectDemo = () => {
  const { theme } = useContext(ConfigContext);
  const [house, setHouse] = useState("club");
  const [city, setCity] = useState(null);
  const [simple, setSimple] = useState("low");
  const [dialCode, setDialCode] = useState("US");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("US");
  const [groupedVal, setGroupedVal] = useState(null);
  const [groupedOptions, setGroupedOptions] = useState([
    {
      group: "Fruits",
      icon: "apple",
      collapsed: false,
      options: [
        { label: "Apple", value: "apple", icon: "apple" },
        { label: "Banana", value: "banana" },
        { label: "Cherry", value: "cherry" },
      ],
    },
    {
      group: "Vegetables",
      collapsed: false,
      options: [
        { label: "Carrot", value: "carrot" },
        { label: "Broccoli", value: "broccoli" },
        { label: "Spinach", value: "spinach", disabled: true },
      ],
    },
    {
      group: "Grains",
      collapsed: true,
      options: [
        { label: "Rice", value: "rice" },
        { label: "Oats", value: "oats" },
        { label: "Quinoa", value: "quinoa" },
      ],
    },
    { label: "Water", value: "water" },
    { label: "Juice", value: "juice" },
  ]);

  const handleGroupToggle = (groupLabel) => {
    setGroupedOptions((prev) =>
      prev.map((item) =>
        item.group === groupLabel
          ? { ...item, collapsed: !item.collapsed }
          : item,
      ),
    );
  };

  const code_to_flag = (code) => {
    if (!code || typeof code !== "string") return "";
    return code
      .toUpperCase()
      .split("")
      .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
      .join("");
  };

  const houseOptions = [
    { label: "Heart", value: "heart", icon: "poker_hearts" },
    { label: "Diamond", value: "diamond", icon: "poker_diamonds" },
    { label: "Spade", value: "spade", icon: "poker_spades", disabled: true },
    { label: "Club", value: "club", icon: "poker_clubs" },
  ];
  const simpleOptions = [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ];
  const dialCodeOptions = countries.map((country) => ({
    label: `${country.label} +${country.phone}`,
    value: country.code,
    trigger_label: `+${country.phone}`,
    search: `${country.code} ${country.phone} ${country.label}`,
    icon: (
      <span style={{ fontSize: 16, lineHeight: 1 }}>
        {code_to_flag(country.code)}
      </span>
    ),
  }));
  const countryOptions = [
    { label: "United States", value: "US" },
    { label: "China", value: "CN" },
    { label: "Japan", value: "JP" },
    { label: "South Korea", value: "KR" },
    { label: "United Kingdom", value: "GB" },
    { label: "France", value: "FR" },
    { label: "Germany", value: "DE" },
    { label: "Spain", value: "ES" },
    { label: "Italy", value: "IT" },
    { label: "Canada", value: "CA" },
    { label: "Australia", value: "AU" },
    { label: "Brazil", value: "BR" },
    { label: "India", value: "IN" },
    { label: "Mexico", value: "MX" },
    { label: "Netherlands", value: "NL" },
    { label: "Sweden", value: "SE" },
    { label: "Norway", value: "NO" },
    { label: "Singapore", value: "SG" },
    { label: "Thailand", value: "TH" },
    { label: "Vietnam", value: "VN" },
  ];
  const countryOptionsWithFlags = countryOptions.map((option) => ({
    ...option,
    search: `${option.label} ${option.value}`,
    icon: (
      <span style={{ fontSize: 16, lineHeight: 1 }}>
        {code_to_flag(option.value)}
      </span>
    ),
  }));

  const cityOptions = [
    { label: "New York", value: "nyc", icon: "map" },
    { label: "San Francisco", value: "sf", icon: "map" },
    { label: "Tokyo", value: "tokyo", icon: "map" },
    { label: "Sydney", value: "sydney", icon: "map" },
    { label: "Berlin", value: "berlin", icon: "map", disabled: true },
    { label: "Singapore", value: "singapore", icon: "map" },
    { label: "London", value: "london", icon: "map" },
    { label: "Paris", value: "paris", icon: "map" },
    { label: "Toronto", value: "toronto", icon: "map" },
    { label: "Seoul", value: "seoul", icon: "map" },
    { label: "Bangkok", value: "bangkok", icon: "map" },
    { label: "Rome", value: "rome", icon: "map" },
    { label: "Barcelona", value: "barcelona", icon: "map" },
    { label: "Dubai", value: "dubai", icon: "map" },
    { label: "Delhi", value: "delhi", icon: "map" },
    { label: "Mexico City", value: "mexico_city", icon: "map" },
    { label: "Sao Paulo", value: "sao_paulo", icon: "map" },
    { label: "Cape Town", value: "cape_town", icon: "map" },
  ];

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
        Selects
      </span>
      <SinkingSelect
        options={houseOptions}
        value={house}
        set_value={setHouse}
        filter_mode="trigger"
        placeholder="Select suit"
        style={{ width: 240 }}
      />
      <SinkingSelect
        options={cityOptions}
        value={city}
        set_value={setCity}
        filter_mode="panel"
        placeholder="Select city"
        search_placeholder="Filter cities..."
        style={{ width: 280 }}
        dropdown_style={{ maxWidth: 320, maxHeight: 240 }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        <SinkingSelect
          options={dialCodeOptions}
          value={dialCode}
          set_value={setDialCode}
          filter_mode="panel"
          placeholder="country code"
          search_placeholder="Search country / code"
          style={{ width: 100, borderRadius: "7px 0px 0px 7px" }}
          dropdown_style={{ maxWidth: 700, maxHeight: 240 }}
          show_trigger_icon={false}
        />
        <SinkingInput
          label="Phone number"
          value={phone}
          set_value={setPhone}
          style={{ width: 200, borderRadius: "0px 7px 7px 0px" }}
        />
      </div>
      <SinkingSelect
        options={countryOptionsWithFlags}
        value={country}
        set_value={setCountry}
        filter_mode="panel"
        placeholder="Select country"
        search_placeholder="Filter countries..."
        style={{ width: 260 }}
        dropdown_style={{ maxWidth: 320, maxHeight: 240 }}
      />
      <SinkingSelect
        options={simpleOptions}
        value={simple}
        set_value={setSimple}
        filterable={false}
        filter_mode="panel"
        placeholder="Priority (no filter)"
        style={{ width: 240 }}
      />
      <SinkingSelect
        options={cityOptions}
        filter_mode="panel"
        placeholder="Compact list"
        style={{ width: 220, fontSize: 14, height: 32 }}
        dropdown_style={{ maxWidth: 260, maxHeight: 180 }}
        option_style={{ height: 28, padding: "4px 8px" }}
      />
      <SinkingSelect
        options={cityOptions}
        filter_mode="trigger"
        placeholder="Disabled select"
        style={{ width: 240 }}
        disabled
      />
      <FloatingSelect
        options={simpleOptions}
        value={simple}
        set_value={setSimple}
        label="Priority"
        filterable={false}
        filter_mode="panel"
        style={{ width: 200 }}
      />
      <FloatingSelect
        options={cityOptions}
        value={city}
        set_value={setCity}
        label="City"
        filter_mode="trigger"
        placeholder="Search city..."
        style={{ width: 240 }}
        dropdown_style={{ maxHeight: 220 }}
      />
      <FloatingSelect
        options={countryOptionsWithFlags}
        value={country}
        set_value={setCountry}
        label="Country"
        filter_mode="panel"
        search_placeholder="Filter..."
        style={{ width: 240 }}
        dropdown_style={{ maxHeight: 220 }}
      />
      <Select
        options={houseOptions}
        value={house}
        set_value={setHouse}
        placeholder="Suit"
        filterable={false}
      />
      <Select
        options={simpleOptions}
        value={simple}
        set_value={setSimple}
        placeholder="Priority"
        filterable={false}
      />
      <Select
        options={cityOptions}
        value={city}
        set_value={setCity}
        placeholder="City"
        search_placeholder="Filter cities..."
        dropdown_style={{ maxHeight: 220 }}
      />

      {/* ── Grouped Select demos ── */}
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "32px",
          fontFamily: "Jost",
          color: theme?.color || "black",
          marginTop: 16,
          userSelect: "none",
        }}
      >
        Grouped Selects
      </span>
      <SinkingSelect
        options={groupedOptions}
        value={groupedVal}
        set_value={setGroupedVal}
        on_group_toggle={handleGroupToggle}
        filter_mode="panel"
        placeholder="Select food..."
        search_placeholder="Filter..."
        style={{ width: 280 }}
        dropdown_style={{ maxHeight: 300 }}
      />
      <FloatingSelect
        options={groupedOptions}
        value={groupedVal}
        set_value={setGroupedVal}
        on_group_toggle={handleGroupToggle}
        label="Food"
        filter_mode="trigger"
        placeholder="Search food..."
        style={{ width: 280 }}
        dropdown_style={{ maxHeight: 300 }}
      />
      <Select
        options={groupedOptions}
        value={groupedVal}
        set_value={setGroupedVal}
        on_group_toggle={handleGroupToggle}
        placeholder="Food"
        search_placeholder="Filter..."
        dropdown_style={{ maxHeight: 300 }}
      />
    </div>
  );
};

export default SelectDemo;
