// City list — extend this array to add more cities in future.
// Each entry maps a city name to its state.
export const CITY_STATE_MAP = {
  "Mumbai":      "Maharashtra",
  "Navi Mumbai": "Maharashtra",
  "Pune":        "Maharashtra",
  "Nashik":      "Maharashtra",
  "Thane":       "Maharashtra",
  "Palghar":     "Maharashtra",
};

export const SUPPORTED_CITIES = Object.keys(CITY_STATE_MAP);

/**
 * CitySelect — dropdown for supported cities.
 * Renders a `.field` wrapper with label + select.
 * Use `className` prop to override wrapper class (e.g. for field-row layouts).
 */
export default function CitySelect({
  city,
  onChange,
  label       = "City",
  placeholder = "Select city…",
  required    = false,
  className   = "field",
}) {
  return (
    <div className={className}>
      <label>{label}{required && " *"}</label>
      <select
        className="input"
        value={city}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {city && !CITY_STATE_MAP[city] && <option value={city}>{city}</option>}
        {SUPPORTED_CITIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
