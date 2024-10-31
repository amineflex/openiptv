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
                console.error("Erreur lors de la récupération des catégories");
                return null;
            }
        } catch (error) {
            console.error("Erreur de connexion", error);
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
                console.error("Erreur lors de la récupération des chaînes");
                return null;
            }
        } catch (error) {
            console.error("Erreur de connexion", error);
            return null;
        }
    },

    fetchAllChannels: async (stream) => {
        const url = `${stream.url}/player_api.php?username=${stream.username}&password=${stream.password}&action=get_live_streams&category_id=1`;
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
                console.error("Erreur lors de la récupération de toutes les chaînes");
                return null;
            }
        } catch (error) {
            console.error("Erreur de connexion", error);
            return null;
        }
    }
};
