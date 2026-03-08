import { useEffect, useRef, useState } from 'react';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

function loadGoogleIdentityScript(): Promise<void> {
    if (window.google?.accounts?.id) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Failed to load Google sign-in script')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = GOOGLE_SCRIPT_ID;
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google sign-in script'));
        document.head.appendChild(script);
    });
}

interface GoogleLoginButtonProps {
    clientId?: string;
    disabled?: boolean;
    onCredential: (credential: string) => void;
    onError: (message: string) => void;
}

export default function GoogleLoginButton({
    clientId,
    disabled = false,
    onCredential,
    onError
}: GoogleLoginButtonProps) {
    const buttonContainerRef = useRef<HTMLDivElement | null>(null);
    const onCredentialRef = useRef(onCredential);
    const onErrorRef = useRef(onError);
    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        onCredentialRef.current = onCredential;
        onErrorRef.current = onError;
    }, [onCredential, onError]);

    useEffect(() => {
        let isCancelled = false;

        if (!clientId) {
            setIsReady(false);
            setErrorMessage(null);
            return;
        }

        setErrorMessage(null);
        loadGoogleIdentityScript()
            .then(() => {
                if (isCancelled || !buttonContainerRef.current || !window.google?.accounts?.id) {
                    return;
                }

                buttonContainerRef.current.innerHTML = '';
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (response) => {
                        if (!response.credential) {
                            const message = 'Google sign-in did not return a credential.';
                            setErrorMessage(message);
                            onErrorRef.current(message);
                            return;
                        }

                        setErrorMessage(null);
                        onCredentialRef.current(response.credential);
                    }
                });

                window.google.accounts.id.renderButton(buttonContainerRef.current, {
                    theme: 'outline',
                    size: 'medium',
                    text: 'continue_with',
                    shape: 'pill',
                    width: 240
                });

                setIsReady(true);
            })
            .catch((error) => {
                if (!isCancelled) {
                    setIsReady(false);
                    const message = error instanceof Error ? error.message : 'Failed to load Google sign-in';
                    setErrorMessage(message);
                    onErrorRef.current(message);
                }
            });

        return () => {
            isCancelled = true;
            if (buttonContainerRef.current) {
                buttonContainerRef.current.innerHTML = '';
            }
        };
    }, [clientId]);

    if (!clientId) {
        return (
            <div className="text-xs text-amber-300">
                Set `VITE_GOOGLE_CLIENT_ID` to enable Google login.
            </div>
        );
    }

    return (
        <div className={`min-h-[40px] ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
            {!isReady && (
                <div className="text-xs text-gray-400 mb-2">
                    Loading Google sign-in...
                </div>
            )}
            <div ref={buttonContainerRef} />
            {errorMessage && (
                <div className="mt-2 text-xs text-rose-300">
                    {errorMessage}
                </div>
            )}
        </div>
    );
}
