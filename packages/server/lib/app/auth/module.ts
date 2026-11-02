import { type Binder, inject, type Module, provides } from "@fastr/invert";
import { Env } from "@keybr/config";
import { type AbstractAdapter, GoogleAdapter } from "@keybr/oauth";

export abstract class AdapterFactory {
  abstract makeAdapter(redirectUri: string): AbstractAdapter;
}

// Gutentype: Google is the only OAuth door and asks for the email scope only (ISC-21, ISC-23); the facebook
// and microsoft adapters are not registered, so their routes answer 404.
export class AuthModule implements Module {
  configure(binder: Binder) {}

  @provides({ id: AdapterFactory, name: "google", singleton: true })
  provideGoogleAdapter(
    @inject("canonicalUrl") canonicalUrl: string,
  ): AdapterFactory {
    const clientId = Env.getString("AUTH_GOOGLE_CLIENT_ID");
    const clientSecret = Env.getString("AUTH_GOOGLE_CLIENT_SECRET");
    const scope = ["email"].join(" ");
    return new (class GoogleAdapterFactory extends AdapterFactory {
      makeAdapter(redirectUri: string): AbstractAdapter {
        return new GoogleAdapter({
          clientId,
          clientSecret,
          scope,
          redirectUri: String(new URL(redirectUri, canonicalUrl)),
        });
      }
    })();
  }
}
