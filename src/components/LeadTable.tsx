import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, onSnapshot, getDoc, doc as fdoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GoogleGenAI, Type } from '@google/genai';
import { Loader2, Trash2, Send, Copy, ExternalLink, Download } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function LeadTable() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [template, setTemplate] = useState("Hi {{name}}, I noticed your work at {{company}}. We help companies in your industry scale seamlessly. Let's connect!");
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingMessages, setIsGeneratingMessages] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'leads'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeads(docs.sort((a: any, b: any) => {
        // Unscored or Not Sent go first
        if (a.status === "Not Sent" && b.status !== "Not Sent") return -1;
        if (b.status === "Not Sent" && a.status !== "Not Sent") return 1;
        return b.lastActionDate - a.lastActionDate;
      }));
    });
    return unsub;
  }, [user]);

  const removeLead = async (id: string) => {
    await deleteDoc(fdoc(db, 'users', user!.uid, 'leads', id));
  };

  const handleRefine = async () => {
    if (!user) return;
    setIsRefining(true);
    
    // Step 1 & 2: Deduplicate and Basic Filtering
    const seenUrls = new Set();
    const seenEmails = new Set();
    const toDelete: string[] = [];
    const validLeads = [];

    for (const lead of leads) {
      if (lead.label !== "Unscored") {
        validLeads.push(lead);
        continue;
      }

       // Filter missing vital info
      if (!lead.name || lead.name === "Unknown" || !lead.bio || lead.bio.trim().length < 5) {
        toDelete.push(lead.id);
        continue;
      }

      // Deduplicate
      if (lead.profileUrl && seenUrls.has(lead.profileUrl)) {
        toDelete.push(lead.id);
        continue;
      }
      if (lead.email && seenEmails.has(lead.email)) {
        toDelete.push(lead.id);
        continue;
      }

      if (lead.profileUrl) seenUrls.add(lead.profileUrl);
      if (lead.email) seenEmails.add(lead.email);

      validLeads.push(lead);
    }

    // Step 3: AI Scoring for unscored valid leads
    const unscoredLeads = validLeads.filter(l => l.label === "Unscored");
    
    if (unscoredLeads.length > 0) {
      try {
        const userDoc = await getDoc(fdoc(db, 'users', user.uid));
        const personaDesc = userDoc.data()?.personaDesc || "General B2B Sales/Services";
        const painPoints = userDoc.data()?.painPoints || "General operational inefficiency, low revenue";

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Score the following leads from 0-100 based on their relevance and likelihood of being a good prospect for my services.

          Context about ME (The User):
          - Who I am / What I do: ${personaDesc}
          - Pain points I solve: ${painPoints}

          Instructions:
          Analyze the Lead JSON below. If they match the industry, persona, or could likely use my services to solve their pain points, assign a high score. Ensure data completeness.
          Assign label High (>=80), Medium (50-79), Low (<50).
          
          Leads JSON:
          ${JSON.stringify(unscoredLeads.map(l => ({ id: l.id, name: l.name, bio: l.bio })))}
          `,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
               type: Type.ARRAY,
               items: {
                 type: Type.OBJECT,
                 properties: {
                   id: { type: Type.STRING },
                   score: { type: Type.NUMBER },
                   label: { type: Type.STRING, description: "Must be 'High', 'Medium', or 'Low'" }
                 },
                 required: ["id", "score", "label"]
               }
            }
          }
        });

        const scoredData = JSON.parse(response.text?.trim() || "[]");
        
        for (const data of scoredData) {
          if (data.label === "Low") {
            toDelete.push(data.id);
          } else {
            await updateDoc(fdoc(db, 'users', user.uid, 'leads', data.id), {
              score: data.score,
              label: data.label,
              lastActionDate: Date.now()
            });
          }
        }
      } catch (err) {
         console.error("Scoring failed:", err);
      }
    }

    // Execute deletions
    for (const id of toDelete) {
      await removeLead(id);
    }

    setIsRefining(false);
  };

  const generateMessages = async () => {
    if (!user) return;
    setIsGeneratingMessages(true);

    const pendingLeads = leads.filter(l => l.label !== "Unscored" && !l.message);
    let personaDesc = "";
    let painPoints = "";
    try {
       const userDoc = await getDoc(fdoc(db, 'users', user.uid));
       personaDesc = userDoc.data()?.personaDesc || "";
       painPoints = userDoc.data()?.painPoints || "";
    } catch(e) {}
    
    for (const lead of pendingLeads) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `You are an expert sales rep. Personalize this exact outreach template for the lead below. Keep it short, natural, and friendly. Do not use placeholders, fill them in.
          
          About Me (Sender Context):
          - Who I am / What I do: ${personaDesc}
          - Pain points I solve: ${painPoints}
          
          Template:
          ${template}

          Lead Context:
          Name: ${lead.name}
          Bio: ${lead.bio}
          Profile: ${lead.profileUrl}
          `
        });

        const msg = response.text?.trim() || "Could not generate message.";
        await updateDoc(fdoc(db, 'users', user.uid, 'leads', lead.id), {
          message: msg,
          lastActionDate: Date.now()
        });
      } catch (e) {
        console.error("Generate message error", e);
      }
    }
    setIsGeneratingMessages(false);
  };

  const generateFollowUp = async (leadId: string, currentMessage: string, bio: string) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Write a natural follow-up message to this sequence. Keep it very short, 1-2 sentences. 
            Lead Bio: ${bio}
            Previous Message Sent: ${currentMessage}
            `
        });
        const msg = response.text?.trim();
        if (msg && user) {
            await updateDoc(fdoc(db, 'users', user.uid, 'leads', leadId), {
                message: msg,
                status: "Follow-up 1",
                lastActionDate: Date.now()
            });
        }
    } catch (e) {
        console.error("Follow up error", e);
    }
  }

  const updateStatus = async (id: string, status: string) => {
    if (!user) return;
    await updateDoc(fdoc(db, 'users', user.uid, 'leads', id), {
      status,
      lastActionDate: Date.now()
    });
  };

  const handleSend = (lead: any) => {
    // 1. Copy to clipboard
    navigator.clipboard.writeText(lead.message);
    // 2. Open Profile
    if (lead.profileUrl && lead.profileUrl.startsWith('http')) {
      window.open(lead.profileUrl, '_blank');
    }
    // 3. Mark as Sent
    updateStatus(lead.id, 'Sent');
  };

  const scrollToNextUnsent = () => {
    const unsentRow = document.querySelector('tr[data-status="Not Sent"]');
    if (unsentRow) {
      unsentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief highlight
      (unsentRow as HTMLElement).style.backgroundColor = '#fdf2f8';
      setTimeout(() => {
         (unsentRow as HTMLElement).style.backgroundColor = '';
      }, 1500);
    } else {
      alert('No more unsent leads in this pipeline!');
    }
  };

  const exportCSV = () => {
    const headers = ["Name", "Platform", "Profile URL", "Email", "Message", "Status", "Label", "Last Action"];
    const rows = leads.map(l => [
      l.name, l.platform, l.profileUrl || "", l.email || "", `"${(l.message||"").replace(/"/g, '""')}"`, l.status, l.label || "", new Date(l.lastActionDate).toISOString()
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leads_export.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Card className="shadow-sm border rounded-xl overflow-hidden bg-white">
      <CardHeader className="bg-white border-b px-6 py-4">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <CardTitle className="font-bold text-slate-800 text-lg">High-Priority Leads Queue</CardTitle>
            <CardDescription className="text-xs font-medium text-slate-500 mt-1">Manage, enrich, and contact your prospects.</CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
             <Button variant="secondary" onClick={exportCSV} className="h-8 font-medium">Export CSV</Button>
             <Button variant="default" onClick={scrollToNextUnsent} className="h-8 bg-blue-600 text-white hover:bg-blue-700">Next Lead &rarr;</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Actions Menu */}
        <div className="flex flex-col md:flex-row gap-4 bg-slate-50 p-4 rounded-xl border">
           <div className="flex-1 space-y-2">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-600">1. Refine & Score Data</span>
              <p className="text-[11px] text-slate-500">Dedupes, cleans, and scores leads via AI.</p>
              <Button size="sm" onClick={handleRefine} disabled={isRefining} variant="secondary" className="w-full text-xs font-medium shadow-sm">
                {isRefining && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Run Refinement
              </Button>
           </div>
           
           <div className="flex-[2] space-y-2">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-600">2. Generate Messages</span>
              <p className="text-[11px] text-slate-500">Generates hyper-personalized messages based on template.</p>
              <div className="flex gap-2">
                <Textarea 
                  value={template} 
                  onChange={e => setTemplate(e.target.value)}
                  className="min-h-[60px] text-xs h-[80px] font-mono p-3 bg-white"
                  placeholder="Base template..."
                />
                <Button size="sm" className="h-[80px] shrink-0 text-xs font-bold" onClick={generateMessages} disabled={isGeneratingMessages}>
                  {isGeneratingMessages && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Generate
                </Button>
              </div>
           </div>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <table className="data-table">
            <thead>
              <tr className="bg-slate-50">
                <th>Quality</th>
                <th>Contact Info</th>
                <th>Message Snippet</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-xs font-medium">No leads found. Generate some above.</td></tr>
              )}
              {leads.map(lead => (
                <tr key={lead.id} data-status={lead.status} className="hover:bg-slate-50 transition-colors">
                  <td>
                     {lead.label === 'Unscored' ? <span className="score-pill bg-slate-100 text-slate-500 border border-slate-200">--</span> : 
                      lead.label === 'High' ? <span className="score-pill bg-green-100 text-green-700 border border-green-200">{lead.score}</span> :
                      <span className="score-pill bg-yellow-100 text-yellow-700 border border-yellow-200">{lead.score}</span>
                     }
                  </td>
                  <td className="max-w-[200px]">
                     <div className="font-bold text-[13px] text-blue-600 truncate">{lead.name}</div>
                     <div className="text-[11px] text-slate-500 mt-0.5 truncate">{lead.platform} {lead.email && <span className="ml-1 text-[10px] text-slate-400">• Email</span>}</div>
                  </td>
                  <td className="max-w-[250px]">
                    {lead.message ? (
                      <div className="text-[11px] font-mono text-slate-600 line-clamp-3 p-2 bg-slate-50 rounded border border-slate-100" title={lead.message}>{lead.message}</div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic font-mono">-- pending --</span>
                    )}
                  </td>
                  <td>
                     {lead.status === "Not Sent" && <span className="inline-flex items-center text-[11px] font-medium text-slate-600"><span className="status-dot bg-slate-300"></span>Not Sent</span>}
                     {lead.status === "Sent" && <span className="inline-flex items-center text-[11px] font-medium text-blue-600"><span className="status-dot bg-blue-500"></span>Sent</span>}
                     {lead.status.startsWith("Follow-up") && <span className="inline-flex items-center text-[11px] font-medium text-purple-600"><span className="status-dot bg-purple-400"></span>{lead.status}</span>}
                     {lead.status === "Replied" && <span className="inline-flex items-center text-[11px] font-medium text-green-600"><span className="status-dot bg-green-500"></span>Replied</span>}
                     {lead.status === "Skipped" && <span className="inline-flex items-center text-[11px] font-medium text-slate-500"><span className="status-dot bg-slate-200"></span>Skipped</span>}
                  </td>
                  <td className="text-right">
                     <div className="flex justify-end gap-1 flex-wrap w-[220px]">
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          className="w-8 h-8 rounded-md bg-white border border-slate-200 shadow-sm" 
                          title="Copy Message" 
                          disabled={!lead.message}
                          onClick={() => navigator.clipboard.writeText(lead.message)}
                        >
                           <Copy className="w-3 h-3 text-slate-600"/>
                        </Button>
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          className="w-8 h-8 rounded-md bg-white border border-slate-200 shadow-sm" 
                          title="Open Profile" 
                          disabled={!lead.profileUrl}
                          onClick={() => window.open(lead.profileUrl, '_blank')}
                        >
                           <ExternalLink className="w-3 h-3 text-slate-600"/>
                        </Button>
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] font-semibold px-2 mx-1 bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => handleSend(lead)}
                          disabled={!lead.message || lead.status === 'Replied' || lead.status === 'Skipped'}
                        >
                           <Send className="w-3 h-3 mr-1"/> Send
                        </Button>
                        <div className="w-full flex gap-1 mt-1">
                           <Button size="sm" variant="secondary" className="flex-1 text-[10px] h-6 bg-white border shadow-sm border-slate-200" onClick={() => updateStatus(lead.id, 'Replied')}>
                             Reply
                           </Button>
                           <Button size="sm" variant="secondary" className="flex-1 text-[10px] h-6 bg-white border shadow-sm border-slate-200" onClick={() => updateStatus(lead.id, 'Skipped')}>
                             Skip
                           </Button>
                           {lead.status === 'Sent' && lead.message && (
                            <Button size="sm" variant="secondary" className="flex-1 text-[10px] h-6 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => generateFollowUp(lead.id, lead.message, lead.bio)}>
                              Flw-up
                            </Button>
                           )}
                        </div>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
