import { Metadata } from "@grpc/grpc-js";
import type { Request, Response } from "hyper-express";
import { ChatMessagePrompt, RoomsList } from "@workadventure/messages";
import { z } from "zod";
import { apiClientRepository } from "../services/ApiClientRepository";
import { adminToken } from "../middlewares/AdminToken";
import { validatePostQuery } from "../services/QueryValidator";
import { adminService } from "../services/AdminService";
import { BaseHttpController } from "./BaseHttpController";

export class AdminController extends BaseHttpController {
    routes(): void {
        this.receiveGlobalMessagePrompt();
        this.receiveRoomEditionPrompt();
        this.getRoomsList();
        this.sendChatMessagePrompt();
        this.dispatchGlobalEvent();
        this.getMembersOfTheActualWorld();
    }

    /**
     * @openapi
     * /room/refresh:
     *   post:
     *     description: Forces anyone out of the room. The request must be authenticated with the "admin-token" header.
     *     tags:
     *      - Admin endpoint
     *     parameters:
     *      - name: "authorization"
     *        in: "header"
     *        required: true
     *        type: "string"
     *        description: The token to be allowed to access this API (in ADMIN_API_TOKEN environment variable)
     *      - name: "roomId"
     *        in: "body"
     *        description: "The ID (full URL) to the room"
     *        required: true
     *        type: "string"
     *     responses:
     *       200:
     *         description: Will always return "ok".
     *         example: "ok"
     */
    receiveRoomEditionPrompt(): void {
        this.app.post("/room/refresh", [adminToken], async (req: Request, res: Response) => {
            const body = await req.json();

            if (typeof body.roomId !== "string") {
                throw new Error("Incorrect roomId parameter");
            }
            const roomId: string = body.roomId;

            await apiClientRepository.getClient(roomId).then((roomClient) => {
                return new Promise<void>((res, rej) => {
                    roomClient.sendRefreshRoomPrompt(
                        {
                            roomId,
                        },
                        (err) => {
                            err ? rej(err) : res();
                        }
                    );
                });
            });

            res.atomic(() => {
                res.send("ok");
            });

            return;
        });
    }

    /**
     * @openapi
     * /message:
     *   post:
     *     description: Sends a message (or a world full message) to a number of rooms.
     *     tags:
     *      - Admin endpoint
     *     parameters:
     *      - name: "authorization"
     *        in: "header"
     *        required: true
     *        type: "string"
     *        description: The token to be allowed to access this API (in ADMIN_API_TOKEN environment variable)
     *      - name: "text"
     *        in: "body"
     *        description: "The text of the message"
     *        required: true
     *        type: "string"
     *      - name: "type"
     *        in: "body"
     *        description: Either "capacity" or "message
     *        required: true
     *        type: "string"
     *      - name: "targets"
     *        in: "body"
     *        description: The list of room IDs to target
     *        required: true
     *        type: array
     *        items:
     *          type: string
     *          example: "https://play.workadventu.re/@/foo/bar/baz"
     *     responses:
     *       200:
     *         description: Will always return "ok".
     *         example: "ok"
     */
    receiveGlobalMessagePrompt(): void {
        this.app.post("/message", [adminToken], async (req: Request, res: Response) => {
            const body = await req.json();

            if (typeof body.text !== "string") {
                throw new Error("Incorrect text parameter");
            }
            if (body.type !== "capacity" && body.type !== "message") {
                throw new Error("Incorrect type parameter");
            }
            if (!body.targets || typeof body.targets !== "object") {
                throw new Error("Incorrect targets parameter");
            }
            const text: string = body.text;
            const type: string = body.type;
            const targets: string[] = body.targets;

            await Promise.all(
                targets.map((roomId) => {
                    return apiClientRepository.getClient(roomId).then((roomClient) => {
                        return new Promise<void>((res, rej) => {
                            if (type === "message") {
                                roomClient.sendAdminMessageToRoom(
                                    {
                                        message: text,
                                        roomId: roomId,
                                        type: "", // TODO: what to put here?
                                    },
                                    (err) => {
                                        err ? rej(err) : res();
                                    }
                                );
                            } else if (type === "capacity") {
                                roomClient.sendWorldFullWarningToRoom(
                                    {
                                        roomId,
                                    },
                                    (err) => {
                                        err ? rej(err) : res();
                                    }
                                );
                            }
                        });
                    });
                })
            );

            res.atomic(() => {
                res.send("ok");
            });
        });
    }

    /**
     * @openapi
     * /rooms:
     *   get:
     *     description: Returns the list of all rooms, along the number of users in each room.
     *     tags:
     *      - Admin endpoint
     *     parameters:
     *      - name: "Authorization"
     *        in: "header"
     *        required: true
     *        type: "string"
     *        description: The token to be allowed to access this API (in ADMIN_API_TOKEN environment variable)
     *     responses:
     *       200:
     *         description: Will always return "ok".
     *         example: "{\"https://workadventu.re/@/company/world/room\": 24}"
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               additionalProperties:
     *                 type: integer
     */
    getRoomsList(): void {
        this.app.get("/rooms", [adminToken], async (req: Request, res: Response) => {
            const roomClients = await apiClientRepository.getAllClients();

            const promises: Promise<RoomsList>[] = [];
            for (const roomClient of roomClients) {
                promises.push(
                    new Promise<RoomsList>((resolve, reject) => {
                        roomClient.getRooms(
                            {},
                            new Metadata(),
                            {
                                deadline: Date.now() + 1000,
                            },
                            (error, result) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            }
                        );
                    })
                );
            }

            // Note: this call will take at most 1 second because we won't wait more for all the promises to resolve.
            const roomsListsResult = await Promise.allSettled(promises);

            const rooms: Record<string, number> = {};

            for (const roomsListResult of roomsListsResult) {
                if (roomsListResult.status === "fulfilled") {
                    for (const room of roomsListResult.value.roomDescription) {
                        rooms[room.roomId] = room.nbUsers;
                    }
                } else {
                    console.warn(
                        "One back server did not respond within one second to the call to 'getRooms': ",
                        roomsListResult.reason
                    );
                }
            }

            res.atomic(() => {
                res.setHeader("Content-Type", "application/json").send(JSON.stringify(rooms));
            });
            return;
        });
    }

    /**
     * @openapi
     * /global/event:
     *   post:
     *     description: Sends a scripting API event to ALL rooms.
     *     tags:
     *      - Admin endpoint
     *     parameters:
     *      - name: "authorization"
     *        in: "header"
     *        required: true
     *        type: "string"
     *        description: The token to be allowed to access this API (in ADMIN_API_TOKEN environment variable)
     *      - name: "name"
     *        in: "body"
     *        description: "The name of the event"
     *        required: true
     *        type: "string"
     *      - name: "data"
     *        in: "body"
     *        description: "The payload of the event"
     *        required: false
     *        type:
     *          oneOf:
     *          - type: "string"
     *            nullable: true
     *          - type: "object"
     *          - type: "array"
     *          - type: "number"
     *          - type: "boolean"
     *          - type: "integer"
     *     responses:
     *       200:
     *         description: Will always return "ok".
     *         example: "ok"
     */
    dispatchGlobalEvent(): void {
        this.app.post("/global/event", [adminToken], async (req: Request, res: Response) => {
            const body = await validatePostQuery(
                req,
                res,
                z.object({
                    name: z.string(),
                    data: z.unknown().optional(),
                })
            );

            if (body === undefined) {
                return;
            }

            const roomClients = await apiClientRepository.getAllClients();

            const promises: Promise<void>[] = [];
            for (const roomClient of roomClients) {
                promises.push(
                    new Promise<void>((resolve, reject) => {
                        roomClient.dispatchGlobalEvent(
                            {
                                name: body.name,
                                value: body.data,
                            },
                            new Metadata(),
                            {
                                deadline: Date.now() + 1000,
                            },
                            (error, result) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve();
                                }
                            }
                        );
                    })
                );
            }

            // Note: this call will take at most 1 second because we won't wait more for all the promises to resolve.
            const results = await Promise.allSettled(promises);

            for (const roomsListResult of results) {
                if (roomsListResult.status === "rejected") {
                    console.warn(
                        "One back server did not respond within one second to the call to 'dispatchGlobalEvent': ",
                        roomsListResult.reason
                    );
                }
            }

            res.atomic(() => {
                res.send("ok");
            });
            return;
        });
    }

    sendChatMessagePrompt(): void {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.app.post("/chat/message", [adminToken], async (req: Request, res: Response) => {
            const body = await req.json();

            try {
                if (typeof body.roomId !== "string") {
                    throw new Error("Incorrect roomId parameter");
                } else if (typeof body.type !== "string") {
                    throw new Error("Incorrect type parameter");
                } else if (typeof body.mucRoomUrl !== "string") {
                    throw new Error("Incorrect mucRoomUrl parameter");
                } else if (typeof body.mucRoomName !== "string" && body.type === "join") {
                    throw new Error("Incorrect mucRoomName parameter");
                } else if (typeof body.mucRoomType !== "string" && body.type === "join") {
                    throw new Error("Incorrect mucRoomType parameter");
                }
                const roomId: string = body.roomId;
                const mucRoomUrl: string = body.mucRoomUrl;
                const mucRoomName: string = body.mucRoomName;
                const mucRoomType: string = body.mucRoomType;

                const chatMessagePrompt: ChatMessagePrompt = {
                    roomId: body.roomId,
                };

                if (body.type === "join") {
                    chatMessagePrompt.message = {
                        $case: "joinMucRoomMessage",
                        joinMucRoomMessage: {
                            mucRoomDefinitionMessage: {
                                url: mucRoomUrl,
                                name: mucRoomName,
                                type: mucRoomType,
                                subscribe: false,
                            },
                        },
                    };
                } else if (body.type === "leave") {
                    chatMessagePrompt.message = {
                        $case: "leaveMucRoomMessage",
                        leaveMucRoomMessage: {
                            url: mucRoomUrl,
                        },
                    };
                } else {
                    throw new Error("Incorrect type parameter value");
                }

                await apiClientRepository.getClient(roomId).then((roomClient) => {
                    return new Promise<void>((res, rej) => {
                        roomClient.sendChatMessagePrompt(chatMessagePrompt, (err) => {
                            err ? rej(err) : res();
                        });
                    });
                });
            } catch (err) {
                throw new Error("sendChatMessagePrompt => error" + err);
            }

            res.atomic(() => {
                res.send("ok");
            });
            return;
        });
    }

    getMembersOfTheActualWorld(): void {
        this.app.get("/worlds/:worldslug/members", async (req: Request, res: Response) => {
            const { members, total } = await adminService.getMembersOfWorld(req.params.worldslug);

            const MAX_USER_TO_DISPLAY = 200;

            if (total > MAX_USER_TO_DISPLAY) {
                res.status(403).json({
                    message: "Too many members search a member",
                });
            }

            if (total === 0) {
                res.status(204).json({
                    message: "No members for this world",
                });
            }

            return res.status(202).json({
                members,
            });
        });
    }
}
