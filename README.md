```mermaid
graph TB
    subgraph Server["Server (Backend)"]
        A[server.ts] --> |uses| B[eventHub.ts]
        A --> |uses| C[HardwareManager.ts]

        C --> |uses| D[Conveyor.ts]
        C --> |uses| E[ArduinoDeviceManager.ts]
        C --> |uses| F[hardwareUtils.ts]

        E --> |manages| G[arduinoDevice.ts]

        D --> |uses| E
        D --> |uses| B

        C --> |uses| B
        E --> |uses| B

    end

    subgraph External["External Components"]
        J[Socket.io]
    end

    J --> A
    J --> |communicates with| K[Frontend]

    classDef default fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef central fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef device fill:#fff3e0,stroke:#ef6c00,stroke-width:2px;
    classDef utils fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px;
    classDef types fill:#fffde7,stroke:#f9a825,stroke-width:2px;
    classDef external fill:#fbe9e7,stroke:#d84315,stroke-width:2px;
    classDef frontend fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px;

    class A,B default;
    class C,D,E central;
    class G device;
    class F utils;
    class H,I types;
    class J external;
    class K frontend;

    style Server fill:#e3f2fd,stroke:#1565c0,stroke-width:4px;
    style External fill:#ffebee,stroke:#b71c1c,stroke-width:4px;
```

Features:

- Tailwind design
- Tailwind animations and effects
- Full responsiveness
- Clerk Authentication (Email, Google, 9+ Social Logins)
- Client form validation and handling using react-hook-form
- Server error handling using react-toast
- Image Generation Tool (Open AI)
- Video Generation Tool (Replicate AI)
- Conversation Generation Tool (Open AI)
- Music Generation Tool (Replicate AI)
- Page loading state
- Stripe monthly subscription
- Free tier with API limiting

### Setup .env file

```js
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

OPENAI_API_KEY=
REPLICATE_API_TOKEN=

DATABASE_URL=

STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Setup Prisma

Add MySQL Database (I used PlanetScale)

```shell
npx prisma db push

```

### Start the app

```shell
yarn dev
```

## Available commands

Running commands with yarn `yarn [command]`

| command | description                              |
| :------ | :--------------------------------------- |
| `dev`   | Starts a development instance of the app |
