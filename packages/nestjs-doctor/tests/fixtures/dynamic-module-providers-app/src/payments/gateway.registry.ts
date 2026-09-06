import { StripeGateway } from './stripe.gateway.js';

export const gatewayRegistry = {
  providers: [StripeGateway],
  pick: (name: string) => gatewayRegistry.providers.find((gateway) => gateway.name === name),
};
