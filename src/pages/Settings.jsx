import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";

export default function Settings() {
    const { id } = useParams();
    const [stream, setStream] = useState(null);

    // Load stream settings
    useEffect(() => {
        const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
        const currentStream = storedStreams[id];
        if (currentStream) {
            setStream(currentStream);
        }
    }, [id]);

    // Handle settings change
    const handleSettingsChange = (e) => {
        const { name, value } = e.target;
        setStream((prevStream) => ({
            ...prevStream,
            settings: {
                ...prevStream.settings,
                [name]: value
            }
        }));
    };

    const saveSettings = () => {
        const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
        storedStreams[id] = stream;
        localStorage.setItem("streams", JSON.stringify(storedStreams));
        alert("Settings saved successfully!"); // Temporary alert message (will be replaced with a toast notification)
    };

    if (!stream) {
        return <p>Loading...</p>;
    }

    // Define form fields
    const formFields = [
        { label: "Stream Name", name: "name", type: "text", value: stream.name},
        { label: "Stream Domain", name: "domain", type: "text", value: stream.domain },
        { label: "Username", name: "username", type: "text", value: stream.username },
        { label: "Password", name: "password", type: "password", value: stream.password }
    ];

    const settingOptions = [
        {
            label: "Stream format",
            name: "streamFormat",
            options: [
                { value: "ts", label: ".ts (recommended)" },
                { value: "m3u8", label: ".m3u8 (DOESNT WORK ⚠️)" }
            ],
            value: stream.settings.streamFormat
        },
        {
            label: "Adult channel",
            name: "adultChannel",
            options: [
                { value: false, label: "Disable (default)" },
                { value: true, label: "Enable" }
            ],
            value: stream.settings.adultChannel
        },
        {
            label: "Hour format",
            name: "hourFormat",
            options: [
                { value: "24H", label: "24H (default)" },
                { value: "12H", label: "12H" }
            ],
            value: stream.settings.hourFormat
        },
        {
            label: "Max channel per Category",
            name: "maxChannelsPerCategory",
            options: [
                { value: 200, label: "200 (default)" },
                { value: 100, label: "100" },
                { value: 500, label: "500" }
            ],
            value: stream.settings.maxChannelsPerCategory
        }
    ];

    return (
        <div className="bg-dark text-secondary flex justify-center min-h-screen">
            <div className="w-full max-w-5xl p-4">
                <header className="flex justify-between items-center">
                    <h1 className="text-xl font-bold">Settings</h1>
                    <Link to={`/menu/${id}`} className="text-secondary hover:text-secondary-400">
                        <span>Back</span>
                    </Link>
                </header>

                <div className="bg-primary/20 rounded-xl p-4 gap-4 mt-4 flex flex-col">
                    <div className="grid md:grid-cols-2 grid-cols-1 gap-4">
                        {formFields.map(({ label, name, type, value }) => (
                            <div className="gap-2" key={name}>
                                <h3 className="text-lg font-semibold mb-2">{label}</h3>
                                <div>
                                    <input
                                        type={type}
                                        name={name}
                                        className="bg-primary/40 text-secondary w-full p-2 rounded-lg"
                                        value={value}
                                        onChange={(e) => setStream({ ...stream, [name]: e.target.value })}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-primary/20 rounded-xl p-4 gap-4 mt-4 flex flex-col">
                    <div className="grid md:grid-cols-2 grid-cols-1 gap-4">
                    {settingOptions.map(({ label, name, options, value }) => (
                        <div className="flex flex-col md:flex-row justify-between" key={name}>
                            <div>
                                <h3 className="text-lg text-secondary-700 font-semibold">{label}</h3>
                            </div>
                            <div>
                                <select
                                    name={name}
                                    className="bg-primary/40 text-secondary p-2 rounded-lg w-48"
                                    value={value}
                                    onChange={handleSettingsChange}
                                >
                                    {options.map(({ value, label }) => (
                                        <option value={value} key={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>

                <div className="flex justify-center mt-6">
                    <button
                        onClick={saveSettings}
                        className="px-6 py-2 text-secondary bg-secondary-400/10 rounded-xl hover:text-secondary-400 hover:bg-secondary-400/25"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
