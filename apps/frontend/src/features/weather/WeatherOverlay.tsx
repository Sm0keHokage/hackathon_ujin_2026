import type { DashboardWeather } from "../../api/dashboard";

interface WeatherOverlayProps {
    weather: DashboardWeather;
}

export function WeatherOverlay({ weather }: WeatherOverlayProps) {
    const current = weather.current;
    const hourly = weather.hourly?.items?.slice(0, 3) ?? [];

    if (!current && hourly.length === 0) {
        return null;
    }

    return (
        <aside aria-label="Погода" className="weather-overlay" role="region">
            {current && (
                <div className="weather-overlay__current">
                    <img
                        alt={current.description}
                        className="weather-overlay__icon"
                        src={current.icon_url}
                    />
                    <div className="weather-overlay__current-info">
                        <div className="weather-overlay__temp">
                            {formatTemp(current.temp)}
                        </div>
                        <div className="weather-overlay__description">{current.description}</div>
                        <div className="weather-overlay__meta">
                            <span title="Ощущается как">≈ {formatTemp(current.feels_like)}</span>
                            <span title="Влажность">💧 {current.humidity}%</span>
                            <span title="Ветер">💨 {Math.round(current.wind_speed)} м/с</span>
                        </div>
                        {current.location && (
                            <div className="weather-overlay__location">{current.location}</div>
                        )}
                    </div>
                </div>
            )}

            {hourly.length > 0 && (
                <div className="weather-overlay__hourly">
                    {hourly.map((item) => (
                        <div className="weather-overlay__hour" key={item.dt}>
                            <span className="weather-overlay__hour-label">{item.hour}</span>
                            <img alt={item.description} src={item.icon_url} />
                            <span className="weather-overlay__hour-temp">{formatTemp(item.temp)}</span>
                            {item.pop > 0 && (
                                <span className="weather-overlay__hour-pop">{item.pop}%</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
}

function formatTemp(value: number) {
    const rounded = Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded}°`;
}
