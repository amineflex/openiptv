import { useState, useEffect } from "react";
import { apiService } from "../services/apiService";

export const useLiveCategories = (stream) => {
	const [categories, setCategories] = useState([]);

	useEffect(() => {
		if (stream) {
			const fetchCategories = async () => {
				const data = await apiService.fetchLiveCategories(stream);
				if (data) {
					setCategories(data);
				}
			};
			fetchCategories();
		}
	}, [stream]);

	return categories;
};
export const useVodCategories = (stream) => {
	const [categories, setCategories] = useState([]);

	useEffect(() => {
		if (stream) {
			const fetchCategories = async () => {
				const data = await apiService.fetchVodCategories(stream);
				if (data) {
					setCategories(data);
				}
			};
			fetchCategories();
		}
	}, [stream]);

	return categories;
};
