import React, { useState, useEffect } from "react";
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { PlusIcon, TvIcon, TrashIcon, PencilIcon } from "@heroicons/react/24/outline";

export default function EditStream() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    username: '',
    password: ''
  });
  const [streams, setStreams] = useState([]);
  const [editIndex, setEditIndex] = useState(null);

  const inputs = [
    { label: 'Name', type: 'text', name: 'name', placeholder: 'amine1337' },
    { label: 'Domain', type: 'text', name: 'domain', placeholder: 'http://example.com:8080' },
    { label: 'Username', type: 'text', name: 'username', placeholder: 'amineflex' },
    { label: 'Password', type: 'password', name: 'password', placeholder: '************' }
  ];

  // Charger les streams depuis le localStorage
  useEffect(() => {
    const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
    setStreams(storedStreams);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  // Sauvegarder ou éditer un flux
  const saveCredentials = () => {
    let updatedStreams;
    
    if (editIndex !== null) {
      // Mise à jour d'un flux existant
      updatedStreams = streams.map((stream, i) =>
        i === editIndex ? { ...formData, datetime_added: stream.datetime_added } : stream
      );
    } else {
      // Ajout d'un nouveau flux
      updatedStreams = [...streams, { ...formData, datetime_added: new Date().toISOString() }];
    }
    
    setStreams(updatedStreams);
    localStorage.setItem("streams", JSON.stringify(updatedStreams));

    // Réinitialiser le formulaire et fermer le dialog
    setFormData({ name: '', domain: '', username: '', password: '' });
    setIsOpen(false);
    setEditIndex(null);
  };

  const editStream = (index) => {
    setFormData(streams[index]);
    setEditIndex(index);
    setIsOpen(true);
  };


  const deleteStream = (index) => {
    const updatedStreams = streams.filter((_, i) => i !== index);
    setStreams(updatedStreams);
    localStorage.setItem("streams", JSON.stringify(updatedStreams));
  };

  return (
    <>
     
        {streams.map((stream, i) => (
          <div 
          key={i} 
          className="relative block w-full rounded-lg border-2 border-primary-700 p-6 text-center group">
              <button
                onClick={() => deleteStream(i)}
                className="hidden group-hover:block p-2 rounded-full bg-red-500/40 text-white hover:bg-red-400 absolute top-2 right-2 duration-150"
              >
                <TrashIcon className="h-5 w-5" /> 
              </button>
              <button 
                onClick={() => editStream(i)}
                className="hidden group-hover:block p-2 rounded-full bg-secondary-400/40 text-white hover:bg-primary-600 absolute top-12 right-2 duration-150"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            <TvIcon className="mx-auto h-8 w-8 text-secondary mb-2" />
            <p className="text-lg font-semibold text-primary-800">{stream.name}</p>
            <p className="text-sm text-dark-800">{stream.domain}</p>
            <div className=" justify-center gap-4 mt-4">




            </div>
          </div>
        ))}

      {/* Add stream */}
      <button
        onClick={() => { setIsOpen(true); setEditIndex(null); }}
        className="relative block w-full rounded-lg border-2 border-dashed border-primary-700 p-10 text-center hover:border-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 duration-300 group"
      >
        <PlusIcon className="mx-auto h-12 w-12 text-secondary" />
        <span className="mt-2 block text-sm font-semibold text-primary-800 group-hover:text-primary-700 duration-300">Add IPTV stream</span>
      </button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4 h-screen bg-dark/75">
          <DialogPanel className="max-w-lg space-y-4 bg-dark-300 rounded-xl p-6 text-secondary-600">
            <DialogTitle className="font-bold">{editIndex !== null ? "Edit Stream" : "Add New Stream"}</DialogTitle>

            <section className="flex flex-col gap-4">
              {inputs.map((input, i) => (
                <div key={i}>
                  <label htmlFor={input.name} className="block text-sm font-lg text-secondary">
                    {input.label}
                  </label>
                  <div className="relative mt-1 rounded-md shadow-sm">
                    <input
                      name={input.name}
                      type={input.type}
                      placeholder={input.placeholder}
                      value={formData[input.name]}
                      onChange={handleInputChange}
                      className="block w-full rounded-md py-1.5 pr-20 bg-dark border-1 border-dark-100 text-secondary/80 ring-0 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm"
                    />
                  </div>
                </div>
              ))}
            </section>

            <div className="grid grid-cols-2 gap-4">
              <button className="py-1.5 rounded-xl bg-dark-400 hover:bg-dark-500 duration-300" onClick={() => setIsOpen(false)}>Cancel</button>
              <button className="py-1.5 rounded-xl bg-secondary-400 hover:bg-secondary-500 hover:text-secondary-400 duration-300" onClick={saveCredentials}>
                {editIndex !== null ? "Save Changes" : "Add Stream"}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
