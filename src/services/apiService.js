export const apiService = {
    fetchLiveCategories: async (stream) => {
        const url = `${stream.domain}/player_api.php?username=${stream.username}&password=${stream.password}&action=get_live_categories`;
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'IPTVClient/1.0',
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return await response.json();
            } else {
                console.error("Failed to fetch live categories");
                return null;
            }
        } catch (error) {
            console.error("Connection error :", error);
            return null;
        }
    },

    fetchLiveStreamsByCategory: async (stream, categoryId) => {
        const url = `${stream.domain}/player_api.php?username=${stream.username}&password=${stream.password}&action=get_live_streams&category_id=${categoryId}`;
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'IPTVClient/1.0',
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return await response.json();
            } else {
                console.error("Failed to fetch live streams by category");
                return null;
            }
        } catch (error) {
            console.error("Connection error :", error);
            return null;
        }
    },

   
};
