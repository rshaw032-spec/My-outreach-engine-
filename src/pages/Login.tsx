import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">AI Outreach Machine</CardTitle>
          <CardDescription>
            {isRegistering ? 'Create a new account' : 'Sign in to your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
            <Button type="submit" className="w-full">
              {isRegistering ? 'Register' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-2 mb-4">
             <div className="h-px bg-gray-200 flex-1"></div>
             <span className="text-xs text-gray-500 uppercase">Or</span>
             <div className="h-px bg-gray-200 flex-1"></div>
          </div>
          
          <Button variant="outline" type="button" onClick={handleGoogleSignIn} className="w-full">
            Sign In with Google
          </Button>

        </CardContent>
        <CardFooter>
          <Button variant="link" className="w-full text-sm" onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Already have an account? Sign in' : 'Need an account? Register'}
          </Button>
        </CardFooter>
      </Card>
      {/* Help dialog to guide on email auth */}
      <div className="fixed bottom-4 right-4 bg-yellow-100 p-4 rounded-xl shadow-lg text-sm max-w-[300px] border border-yellow-200 z-50">
        <strong className="text-yellow-800">Note to Admin:</strong>
        <p className="text-yellow-700 mt-1">If using Email/Password auth, please make sure it's enabled in your Firebase Console under Authentication &gt; Sign-in method.</p>
      </div>
    </div>
  );
}
