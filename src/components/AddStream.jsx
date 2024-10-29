import React, { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { PlusIcon } from "@heroicons/react/24/outline";

export default function Example() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    username: '',
    password: ''
  });

  const inputs = [
    { label: 'Name', type: 'text', name: 'name', placeholder: 'amine1337' },
    { label: 'Domain', type: 'text', name: 'domain', placeholder: 'http://example.com:8080' },
    { label: 'Username', type: 'text', name: 'username', placeholder: 'amineflex' },
    { label: 'Password', type: 'password', name: 'password', placeholder: '************' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const saveCredentials = () => {
    if (!window.electronStore) {
      console.error("electronStore n'est pas défini dans le contexte de rendu.");
      return;
    }
  
    const credentials = window.electronStore.get('credentials') || [];
    credentials.push(formData);
    window.electronStore.set('credentials', credentials);
    setFormData({ name: '', domain: '', username: '', password: '' });
    setIsOpen(false);
  };
  

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative block w-full rounded-lg border-2 border-dashed border-primary-700 p-10 text-center hover:border-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 duration-300 group"
      >
        <PlusIcon className="mx-auto h-12 w-12 text-secondary" />
        <span className="mt-2 block text-sm font-semibold text-primary-800 group-hover:text-primary-700 duration-300">Add IPTV stream</span>
      </button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4 h-screen bg-dark/75">
          <DialogPanel className="max-w-lg space-y-4 bg-dark-300 rounded-xl p-6 text-secondary-600">
            <DialogTitle className="font-bold">Add new stream</DialogTitle>

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
              <button className="py-1.5 rounded-xl bg-secondary-400 hover:bg-secondary-500 hover:text-secondary-400 duration-300" onClick={saveCredentials}>Add stream</button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
