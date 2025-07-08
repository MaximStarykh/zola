### **Project:** Zola AI Chat Application
### **Objective:** Implement a series of feature updates and configuration changes.

Here is the step-by-step plan for the autonomous agent.

---

### **High-Level Plan**

The implementation will be broken down into four main phases:
1.  **Backend Configuration:** First, we will modify the core application configuration to restrict models and alter the API key handling logic. This simplifies the environment for subsequent changes.
2.  **Frontend UI Implementation:** Next, we will add the necessary UI controls (toggles/buttons) for the new "Web Search" and "Show Reasoning" features.
3.  **Backend & Frontend Integration:** We will then wire up the new UI controls to the backend, ensuring the necessary flags are passed to the chat API and processed correctly.
4.  **Frontend Rendering:** Finally, we will implement the logic to render the new data (reasoning steps, search indicators, and citations) in the chat interface.

---

### **Detailed Step-by-Step Implementation Plan**

#### **Phase 1: Backend and Configuration Changes**

**Step 1: Configure Models to Use Only Gemini and Disable BYOK**

*   **Action:** Modify the model configuration to exclusively feature Gemini models, mark them as free, and disable the "Bring Your Own Key" (BYOK) functionality.
*   **Rationale:** This establishes a simplified baseline, ensuring all subsequent work is focused on the Gemini provider using a single, server-managed API key.

1.  **File to Edit:** `lib/openproviders/models.ts` (or a similar central model registry).
    *   **Task:** Comment out or delete all model provider configurations (OpenAI, Anthropic, Mistral, Ollama, etc.) except for the Google Gemini models (`gemini-pro`, `gemini-1.5-pro-latest`, etc.).
2.  **File to Edit:** `lib/config.ts`.
    *   **Task:** Locate the `FREE_MODELS_IDS` array. Ensure the string identifiers for all remaining Gemini models are present in this array. This makes them accessible to all users without requiring login.
3.  **File to Edit:** `lib/user-keys.ts`.
    *   **Task:** Find the `getEffectiveApiKey` function. Rewrite its logic to remove any checks for user-provided keys from the database. The function should now *only* retrieve the `GOOGLE_GENERATIVE_AI_API_KEY` from the server's environment (`process.env`).
    *   **Example (Conceptual):**
        ```typescript
        // Before
        // const userKey = await getUserKey(userId, provider);
        // if (userKey) return userKey;
        // return process.env[...];

        // After
        export async function getEffectiveApiKey(
          userId: string,
          provider: string
        ): Promise<string> {
          // Only Google provider is active, so we only need its key.
          if (provider === 'google') {
            return process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
          }
          // Return empty string for any other case.
          return '';
        }
        ```
4.  **Cleanup BYOK-Related Code:**
    *   **File to Delete/Modify:** `app/api/user-key-status/route.ts`. Delete this file as it's no longer needed. If deletion causes import errors, modify it to return a static empty response: `return NextResponse.json({})`.
    *   **Component to Modify:** Search within the `components/` directory for UI elements related to adding or managing API keys (likely in a settings modal). Remove or comment out the JSX for these elements.

#### **Phase 2: Frontend UI for New Features**

**Step 2: Add "Web Search" and "Show Reasoning" Toggles to the UI**

*   **Action:** Implement state management and UI toggles for the new features in the chat interface.
*   **Rationale:** Provide users with clear, accessible controls to activate the new functionalities for each prompt.

1.  **File to Edit:** `components/chat/chat.tsx`.
    *   **Task:** This component manages the session state. Add a new state variable for the reasoning toggle, alongside the existing `enableSearch` state.
        ```typescript
        const [showReasoning, setShowReasoning] = useState<boolean>(false);
        ```
    *   **Task:** Locate the `<ChatInput />` component instance. Pass the new state and its setter function as props: `showReasoning={showReasoning}` and `onToggleReasoning={setShowReasoning}`.
2.  **File to Edit:** `components/chat-input/chat-input.tsx`.
    *   **Task:** Receive the new props: `showReasoning` and `onToggleReasoning`.
    *   **Task:** Add two new icon buttons within the chat input area. Use `shadcn/ui` `Button` and `Tooltip` components for consistency.
        *   **Web Search Toggle:**
            *   **Icon:** Use a globe or magnifying glass icon from `lucide-react`.
            *   **State:** The button's visual state (active/inactive) should reflect the `enableSearch` prop.
            *   **Action:** The `onClick` handler should call `setEnableSearch(!enableSearch)`.
        *   **Show Reasoning Toggle:**
            *   **Icon:** Use a brain, flowchart, or terminal icon from `lucide-react`.
            *   **State:** The button's visual state should reflect the `showReasoning` prop.
            *   **Action:** The `onClick` handler should call `onToggleReasoning(!showReasoning)`.

#### **Phase 3: Backend and Frontend Integration**

**Step 3: Pass New Feature Flags to the Backend Chat API**

*   **Action:** Update the client-side chat submission logic to include the new flags and modify the backend to utilize them.
*   **Rationale:** Connect the frontend controls to the backend model-calling logic.

1.  **File to Edit:** `components/chat/chat.tsx` (within the `useChatCore` custom hook).
    *   **Task:** Find the function responsible for submitting the chat message (e.g., `submit` or `handleSubmit`).
    *   **Task:** In the `body` of the payload sent to the `/api/chat` endpoint, add the `showReasoning` flag. The `enableSearch` flag should already be passed.
2.  **File to Edit:** `app/api/chat/route.ts`.
    *   **Task:** Update the route handler to receive `showReasoning` and `enableSearch` from the request body.
    *   **Task:** Conditionally prepare the `tools` object for the `streamText` call based on the `enableSearch` flag. Use the pre-built search tool from the Vercel Google AI SDK.
    *   **Task:** Update the `toDataStreamResponse` call to conditionally send reasoning data based on the `showReasoning` flag. This optimizes the stream by not sending data the client isn't configured to display.
    *   **Example (Conceptual):**
        ```typescript
        import { google } from '@ai-sdk/google';

        // ... inside the POST handler
        const { messages, enableSearch, showReasoning, ... } = await request.json();

        const tools = enableSearch ? { search: google.search() } : undefined;

        const result = streamText({
          model: yourGeminiModelInstance,
          messages,
          tools,
          // ... other options
        });

        return result.toDataStreamResponse({
          sendReasoning: showReasoning, // Conditionally send reasoning
          sendSources: true // Always send sources if available
        });
        ```

#### **Phase 4: Frontend Rendering of New Data**

**Step 4: Render Search Status, Citations, and Reasoning**

*   **Action:** Update the conversation view to display the new types of information returned by the model.
*   **Rationale:** Provide visual feedback for the new features, making them useful to the end-user.

1.  **File to Edit:** `components/chat/conversation.tsx`.
    *   **Task:** Modify the message rendering logic to handle new data types.
2.  **Display Search in Progress:**
    *   **Task:** The Vercel AI SDK stream may provide a `tool-call` part when a search begins. Listen for this within the message stream.
    *   **Task:** When a search tool call is detected, render a temporary indicator element (e.g., a small component with a spinner and text like "Searching the web..."). This should appear before the final assistant message.
3.  **Render Citations/Sources:**
    *   **Task:** In the component that renders a single assistant message, check if the `message` object contains a `toolInvocations` array with search results, or a top-level `sources` field.
    *   **Task:** If sources are found, iterate over them and render them below the main message content. Each source should be displayed clearly with its title and a link to the original URL.
4.  **Render Reasoning Steps:**
    *   **Task:** The `message` object from the stream will now contain reasoning steps when the feature is enabled. These will likely be in a structured format within the `message` object's data parts.
    *   **Task:** When rendering an assistant's message, check for the presence of these reasoning steps.
    *   **Task:** Create a new, dedicated component (e.g., `ReasoningBlock.tsx`) to format and display this information. The block could be a collapsible `<details>` element or a styled `<pre>` tag to distinguish it from the final answer.
    *   **Task:** In the `Conversation` component, conditionally render this `ReasoningBlock` when reasoning data is available for a message.

---

### **Final Verification Checklist**

After implementing all steps, perform a full end-to-end test:
1.  **Model Configuration:** Confirm the UI only shows Gemini models and that they can be used without logging in.
2.  **UI Controls:** Verify the "Web Search" and "Show Reasoning" toggles appear in the chat input and are interactive.
3.  **Web Search Flow:**
    *   Enable the "Web Search" toggle and ask a question requiring recent information.
    *   Check for the "Searching the web..." indicator.
    *   Verify the final answer includes formatted, clickable source citations.
4.  **Reasoning Flow:**
    *   Enable the "Show Reasoning" toggle and ask a question.
    *   Confirm that the model's reasoning steps are displayed in a distinct, formatted block.
5.  **API Key:** Confirm the BYOK UI is gone and the application functions correctly using the server's `GOOGLE_GENERATIVE_AI_API_KEY`. Check server logs if necessary to ensure no errors related to API keys occur.