// app/(auth)/signup.tsx
import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

type Role = 'player' | 'club';
type Params = { r?: Role };

export default function SignUp() {
    const { r } = useLocalSearchParams<Params>();
    const role: Role = r === 'club' ? 'club' : 'player';

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const router = useRouter();

    const onSignUp = async () => {
        setErr(null);
        try {
            // 1) create auth user
            const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
            const user = cred.user;

            // 2) optional profile displayName
            if (name) await updateProfile(user, { displayName: name });

            // 3) create user doc
            await setDoc(doc(db, 'users', user.uid), {
                displayName: name || null,
                email: user.email,
                role,
                createdAt: serverTimestamp(),
            });

            // 4) go to app
            router.replace('/(tabs)/home');
        } catch (e: any) {
            setErr(e.message ?? 'Sign up failed');
        }
    };

    return (
        <View style={{ padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '600' }}>Create account</Text>
            <TextInput placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput placeholder="Password" value={pw} onChangeText={setPw} secureTextEntry />
            {err && <Text style={{ color: 'red' }}>{err}</Text>}
            <Button title="Sign Up" onPress={onSignUp} />
            <Link href={{ pathname: '/(auth)/login', params: { r: role } }}>Already have an account? Log in</Link>
        </View>
    );
}