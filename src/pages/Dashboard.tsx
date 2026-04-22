import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LeadGenerator from '../components/LeadGenerator';
import LeadTable from '../components/LeadTable';

export default function Dashboard() {
  const { user } = useAuth();
  const [apifyKey, setApifyKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleLogout = () => signOut(auth);

  const saveApiKey = async () => {
    if (!apifyKey) return;
    setIsSaving(true);
    try {
      const resp = await fetch('/api/keys/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apifyKey })
      });
      const data = await resp.json();
      if (data.encryptedKey) {
        await updateDoc(doc(db, 'users', user!.uid), {
          encryptedApifyKey: data.encryptedKey,
          updatedAt: Date.now()
        });
        setApifyKey('');
        alert('API Key updated securely.');
      }
    } catch(err) {
      console.error(err);
      alert('Failed to save API key');
    }
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 border-b flex items-center px-6 bg-white justify-between shrink-0 sticky top-0 z-10 shadow-sm">
        <div className="flex h-full items-center gap-6">
          <div>
            <h1 className="font-bold text-lg tracking-tight text-blue-600">AI OUTREACH M.</h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase">v2.4.0-STABLE</p>
          </div>
          <div className="hidden sm:flex h-full items-center border-l pl-4">
            <div className="stat-box">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Status</p>
              <p className="text-sm font-bold mono text-blue-600">ONLINE</p>
            </div>
            <div className="stat-box border-none">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Module</p>
              <p className="text-sm font-bold mono text-green-600">ACTIVE</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-slate-500 font-mono hidden md:inline-block">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-sm border bg-white border-slate-200">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <Tabs defaultValue="leads" className="w-full">
          <TabsList className="mb-4 bg-slate-100 p-1 border">
            <TabsTrigger value="leads" className="text-xs uppercase tracking-wider font-semibold">Outreach Dashboard</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs uppercase tracking-wider font-semibold">Settings <SettingsIcon className="w-3 h-3 ml-2" /></TabsTrigger>
          </TabsList>
          
          <TabsContent value="leads" className="space-y-6">
            <LeadGenerator />
            <LeadTable />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="bg-white p-6 rounded-xl border shadow-sm max-w-xl">
              <h2 className="font-bold text-slate-800 text-lg mb-4">Integrations</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apifyKey" className="text-[10px] font-bold text-slate-400 uppercase ml-1">Apify API Key (Required for Lead Gen)</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="apifyKey" 
                      type="password" 
                      placeholder="apify_api_..." 
                      className="font-mono bg-white"
                      value={apifyKey}
                      onChange={e => setApifyKey(e.target.value)}
                    />
                    <Button onClick={saveApiKey} disabled={isSaving || !apifyKey} className="bg-blue-600 text-white font-bold">
                      {isSaving ? "Saving..." : "Save Key"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium ml-1">
                    Your key is encrypted on the server before storage.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
