import { useState, useEffect } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { PlusIcon, TvIcon } from "@heroicons/react/24/outline";
import StreamCard from "./StreamCard";
import { storageService } from "../services/storageService";
import type { IptvStream, StreamInput } from "../types";

const emptyForm: StreamInput = { name: "", domain: "", username: "", password: "" };

const inputs: { label: string; type: string; name: keyof StreamInput; placeholder: string }[] = [
	{ label: "Name", type: "text", name: "name", placeholder: "My IPTV" },
	{ label: "Domain", type: "text", name: "domain", placeholder: "http://example.com:8080" },
	{ label: "Username", type: "text", name: "username", placeholder: "amineflex" },
	{ label: "Password", type: "password", name: "password", placeholder: "••••••••••••" }
];

export default function AddStream() {
	const [isOpen, setIsOpen] = useState(false);
	const [formData, setFormData] = useState<StreamInput>(emptyForm);
	const [streams, setStreams] = useState<IptvStream[]>([]);
	const [editId, setEditId] = useState<string | null>(null);

	useEffect(() => {
		setStreams(storageService.getStreams());
	}, []);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const openAdd = () => {
		setFormData(emptyForm);
		setEditId(null);
		setIsOpen(true);
	};

	const openEdit = (stream: IptvStream) => {
		setFormData({ name: stream.name, domain: stream.domain, username: stream.username, password: stream.password });
		setEditId(stream.id);
		setIsOpen(true);
	};

	const save = () => {
		if (!formData.name.trim() || !formData.domain.trim() || !formData.username.trim() || !formData.password.trim()) return;

		if (editId) {
			storageService.updateStream(editId, formData);
		} else {
			storageService.addStream(formData);
		}

		setStreams(storageService.getStreams());
		setIsOpen(false);
	};

	const deleteStream = (id: string) => {
		storageService.deleteStream(id);
		setStreams(storageService.getStreams());
	};

	const isFormValid =
		formData.name.trim() && formData.domain.trim() && formData.username.trim() && formData.password.trim();

	return (
		<>
			{streams.map((stream) => (
				<StreamCard
					key={stream.id}
					stream={stream}
					onEdit={openEdit}
					onDelete={deleteStream}
				/>
			))}

			<button
				type="button"
				onClick={openAdd}
				className="group flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/50 p-6 text-center transition duration-200 hover:border-secondary-400/70 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-secondary-400/50"
			>
				<span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-secondary-700 transition group-hover:bg-secondary-400/20 group-hover:text-secondary-400">
					<PlusIcon className="h-8 w-8" />
				</span>
				<span className="text-sm font-semibold text-secondary-700 transition group-hover:text-secondary">
					Add IPTV stream
				</span>
			</button>

			<Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
				<div className="fixed inset-0 flex w-screen items-center justify-center bg-dark/80 p-4 backdrop-blur-sm">
					<DialogPanel className="w-full max-w-lg space-y-5 rounded-2xl border border-white/10 bg-gray-950/95 p-7 text-secondary shadow-2xl">
						<DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400">
								<TvIcon className="h-6 w-6" />
							</span>
							{editId ? "Edit stream" : "Add new stream"}
						</DialogTitle>

						<section className="flex flex-col gap-4">
							{inputs.map((input) => (
								<div key={input.name}>
									<label htmlFor={input.name} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary-700">
										{input.label}
									</label>
									<input
										id={input.name}
										name={input.name}
										type={input.type}
										placeholder={input.placeholder}
										value={formData[input.name]}
										onChange={handleInputChange}
										className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-secondary-700/60 focus:border-secondary-400 focus:bg-white/10"
									/>
								</div>
							))}
						</section>

						<div className="grid grid-cols-2 gap-3 pt-1">
							<button
								type="button"
								className="rounded-xl border border-white/10 bg-white/5 py-2.5 font-semibold text-secondary transition hover:bg-white/10"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={!isFormValid}
								className="rounded-xl bg-secondary-400 py-2.5 font-bold text-dark shadow-lg shadow-secondary-400/20 transition hover:bg-secondary disabled:cursor-not-allowed disabled:bg-primary/40 disabled:text-secondary-700 disabled:shadow-none"
								onClick={save}
							>
								{editId ? "Save changes" : "Add stream"}
							</button>
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</>
	);
}
