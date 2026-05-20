/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(auth)` | `/(auth)/login` | `/(auth)/register` | `/(tabs)` | `/(tabs)/` | `/(tabs)/explore` | `/(tabs)/organiser` | `/(tabs)/profile` | `/_sitemap` | `/explore` | `/login` | `/organiser` | `/organiser/create` | `/organiser/score` | `/organiser/tournament/[id]/` | `/profile` | `/register`;
      DynamicRoutes: `/organiser/score/badminton/${Router.SingleRoutePart<T>}` | `/organiser/score/cricket/${Router.SingleRoutePart<T>}` | `/organiser/score/football/${Router.SingleRoutePart<T>}` | `/organiser/score/stream/${Router.SingleRoutePart<T>}` | `/organiser/score/tt/${Router.SingleRoutePart<T>}` | `/organiser/tournament/${Router.SingleRoutePart<T>}` | `/organiser/tournament/${Router.SingleRoutePart<T>}/event/${Router.SingleRoutePart<T>}` | `/register/${Router.SingleRoutePart<T>}` | `/t/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/organiser/score/badminton/[matchId]` | `/organiser/score/cricket/[matchId]` | `/organiser/score/football/[matchId]` | `/organiser/score/stream/[matchId]` | `/organiser/score/tt/[matchId]` | `/organiser/tournament/[id]` | `/organiser/tournament/[id]/event/[eventId]` | `/register/[slug]` | `/t/[slug]`;
    }
  }
}
