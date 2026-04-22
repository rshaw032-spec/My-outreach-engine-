import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, collection, doc as fdoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2 } from 'lucide-react';

export default function LeadGenerator() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    place: '',
    industry: '',
    quantity: 10,
    platform: 'LinkedIn',
    emailToggle: false,
    personaDesc: '',
    painPoints: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(d => {
      const data = d.data();
      if (data) {
        setFormData(prev => ({
          ...prev,
          personaDesc: data.personaDesc || '',
          painPoints: data.painPoints || ''
        }));
      }
    }).catch(console.error);
  }, [user]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);
    setError('');

    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists() || !userDoc.data().encryptedApifyKey) {
        throw new Error('Please configure your Apify API key in Settings first.');
      }

      // Save persona desc and pain points to the user document
      await updateDoc(userRef, {
         personaDesc: formData.personaDesc,
         painPoints: formData.painPoints,
         updatedAt: Date.now()
      });

      const encryptedApiKey = userDoc.data().encryptedApifyKey;
      
      const resp = await fetch('/api/apify/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedApiKey,
          ...formData
        })
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      // Save leads to Firestore
      const leadsRef = collection(db, 'users', user.uid, 'leads');
      
      let savedCount = 0;
      for (const lead of result.leads) {
        // Ensure data is valid to avoid rule denial
        const newLeadRef = fdoc(leadsRef);
        await setDoc(newLeadRef, {
           userId: user.uid,
           name: String(lead.name).slice(0, 200) || "Unknown",
           profileUrl: String(lead.profileUrl).slice(0, 1000) || "",
           bio: String(lead.bio).slice(0, 2000) || "",
           platform: lead.platform,
           email: String(lead.email || "").slice(0, 150),
           status: "Not Sent",
           label: "Unscored",
           lastActionDate: Date.now()
        });
        savedCount++;
      }
      
      alert(`Successfully generated and saved ${savedCount} leads!`);
    } catch(err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    }
    setIsLoading(false);
  }

  return (
    <Card className="shadow-sm border rounded-xl overflow-hidden bg-white mb-6">
      <CardHeader className="bg-slate-50 border-b px-6 py-4">
        <CardTitle className="font-bold text-slate-800 text-lg">Lead Construction Engine</CardTitle>
        <CardDescription className="text-[11px] font-mono text-slate-500 mt-1 uppercase">Target criteria for Apify Automation</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Industry</Label>
            <Input className="text-sm font-medium bg-white" required value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} placeholder="e.g. SaaS" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Place</Label>
            <Input className="text-sm font-medium bg-white" required value={formData.place} onChange={e => setFormData({...formData, place: e.target.value})} placeholder="e.g. New York" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Platform</Label>
            <Select value={formData.platform} onValueChange={(val) => setFormData({...formData, platform: val})}>
              <SelectTrigger className="text-sm font-medium bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="Instagram">Instagram</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
                <SelectItem value="Twitter">Twitter (X)</SelectItem>
                <SelectItem value="Skool">Skool Groups</SelectItem>
                <SelectItem value="Discord">Discord Invites/Profiles</SelectItem>
                <SelectItem value="Email">Email lists</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="space-y-1 w-20">
               <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Count</Label>
               <Input className="text-sm font-mono bg-white" type="number" min="1" max="100" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} />
            </div>
            <Button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 text-white hover:bg-blue-700 h-10 font-bold shadow-sm">
               {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> RUN...</> : "+ GENERATE"}
            </Button>
          </div>

          <div className="md:col-span-2 space-y-1 mt-2">
            <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Who am I & What do I do?</Label>
            <Input className="text-sm font-medium bg-slate-50" required value={formData.personaDesc} onChange={e => setFormData({...formData, personaDesc: e.target.value})} placeholder="e.g. I run an SEO agency for B2B SaaS" />
          </div>
          <div className="md:col-span-2 space-y-1 mt-2">
            <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">What pain points do I solve?</Label>
            <Input className="text-sm font-medium bg-slate-50" required value={formData.painPoints} onChange={e => setFormData({...formData, painPoints: e.target.value})} placeholder="e.g. Low organic traffic, high CAC, poor conversion" />
          </div>

          <div className="md:col-span-4 flex justify-between items-center mt-2 border-t pt-3">
             <div className="flex items-center gap-2">
               <input type="checkbox" id="emailToggle" className="rounded" checked={formData.emailToggle} onChange={e => setFormData({...formData, emailToggle: e.target.checked})} />
               <Label htmlFor="emailToggle" className="cursor-pointer text-xs font-medium text-slate-600">Must include email format</Label>
             </div>
             {error && <div className="text-red-500 font-medium text-xs">{error}</div>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
