<script lang="ts">
    import { onDestroy } from "svelte";
    import { ChatRoom } from "../../Connection/ChatConnection";
    import { selectedChatMessageToReply } from "../../Stores/ChatStore";
    import { getChatEmojiPicker } from "../../EmojiPicker";
    import LL from "../../../../i18n/i18n-svelte";
    import { ENABLE_CHAT_UPLOAD } from "../../../Enum/EnvironmentVariable";
    import MessageFileInput from "./Message/MessageFileInput.svelte";
    import MessageInput from "./MessageInput.svelte";
    import { IconCircleX, IconMoodSmile, IconSend } from "@wa-icons";

    export let room: ChatRoom;

    let message = "";
    let messageInput: HTMLDivElement;
    let emojiButtonRef: HTMLButtonElement;
    let stopTypingTimeOutID: undefined | ReturnType<typeof setTimeout>;
    const TYPINT_TIMEOUT = 10000;

    const selectedChatChatMessageToReplyUnsubscriber = selectedChatMessageToReply.subscribe((chatMessage) => {
        if (chatMessage !== null) {
            messageInput.focus();
        }
    });

    function sendMessageOrEscapeLine(keyDownEvent: KeyboardEvent) {
        if (stopTypingTimeOutID) clearTimeout(stopTypingTimeOutID);
        room.startTyping()
            .then(() => {
                stopTypingTimeOutID = setTimeout(() => {
                    room.stopTyping().catch((error) => console.error(error));
                    stopTypingTimeOutID = undefined;
                }, TYPINT_TIMEOUT);
            })
            .catch((error) => console.error(error));

        if (keyDownEvent.key === "Enter" || message == "" || message == undefined) {
            if (stopTypingTimeOutID) clearTimeout(stopTypingTimeOutID);
            room.stopTyping().catch((error) => console.error(error));
        }

        if (keyDownEvent.key === "Enter" && keyDownEvent.shiftKey) {
            return;
        }
        if (keyDownEvent.key === "Enter" && !keyDownEvent.shiftKey) {
            keyDownEvent.preventDefault();
        }
        if (keyDownEvent.key === "Enter" && message.trim().length !== 0) {
            // message contains HTML tags. Actually, the only tags we allow are for the new line, ie. <br> tags.
            // We can turn those back into carriage returns.
            const messageToSend = message.replace(/<br>/g, "\n");
            sendMessage(messageToSend);
            return;
        }
    }

    function sendMessage(messageToSend: string) {
        room?.sendMessage(messageToSend);
        messageInput.innerText = "";
        message = "";
        if (stopTypingTimeOutID) {
            clearTimeout(stopTypingTimeOutID);
        }
    }

    function unselectChatMessageToReply() {
        selectedChatMessageToReply.set(null);
    }

    function onInputHandler() {
        if (message == "" || message == undefined) {
            if (stopTypingTimeOutID) clearTimeout(stopTypingTimeOutID);
            room.stopTyping().catch((error) => console.error(error));
        }
    }

    onDestroy(() => {
        selectedChatChatMessageToReplyUnsubscriber();
    });

    const emojiPicker = getChatEmojiPicker({ right: "0" });
    emojiPicker.on("emoji", ({ emoji }) => {
        message += emoji;
    });

    function openCloseEmojiPicker() {
        emojiPicker.isPickerVisible() ? emojiPicker.hidePicker() : emojiPicker.showPicker(emojiButtonRef);
    }

    $: quotedMessageContent = $selectedChatMessageToReply?.content;
</script>

{#if $selectedChatMessageToReply !== null}
    <div class="tw-flex tw-p-2 tw-items-center tw-gap-1">
        <p class="tw-bg-brand-blue tw-rounded-md tw-p-2 tw-text-xs tw-m-0" style:overflow-wrap="anywhere">
            {$quotedMessageContent?.body}
        </p>
        <button class="tw-p-0 tw-m-0" on:click={unselectChatMessageToReply}>
            <IconCircleX />
        </button>
    </div>
{/if}
<div
    class="tw-flex tw-w-full tw-flex-none tw-items-center tw-py-1 tw-gap-1 tw-border tw-border-solid tw-rounded-xl tw-pr-1 tw-border-light-purple"
>
    <MessageInput
        onKeyDown={sendMessageOrEscapeLine}
        onInput={onInputHandler}
        bind:message
        bind:messageInput
        inputClass="message-input tw-flex-grow !tw-m-0 tw-px-2 tw-max-h-36 tw-overflow-auto  tw-h-full tw-rounded-xl wa-searchbar tw-block tw-text-white placeholder:tw-text-sm  tw-border-light-purple tw-border !tw-bg-transparent tw-resize-none tw-border-none tw-outline-none tw-shadow-none focus:tw-ring-0"
        dataText={$LL.chat.enter()}
        dataTestid="messageInput"
    />
    <button
        class="disabled:tw-opacity-30 disabled:!tw-cursor-none tw-p-0 tw-m-0"
        bind:this={emojiButtonRef}
        on:click={openCloseEmojiPicker}
    >
        <IconMoodSmile font-size={18} />
    </button>

    {#if ENABLE_CHAT_UPLOAD}
        <MessageFileInput {room} />
    {/if}

    <button
        data-testid="sendMessageButton"
        class="disabled:tw-opacity-30 disabled:!tw-cursor-none disabled:tw-text-white tw-p-0 tw-m-0 tw-text-secondary"
        disabled={message.trim().length === 0}
        on:click={() => sendMessage(message)}
    >
        <IconSend font-size={20} />
    </button>
</div>
