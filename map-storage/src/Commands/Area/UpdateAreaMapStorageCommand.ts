import { AreaData, AreaDataProperty, AtLeast, GameMap, UpdateAreaCommand } from "@workadventure/map-editor";
import axios from "axios";
import * as jsonpatch from "fast-json-patch";
import pLimit from "p-limit";
import * as grpc from "@grpc/grpc-js";
import { RoomManagerClient } from "@workadventure/messages/src/ts-proto-generated/services";
import { DispatchModifyAreaRequest, ModifyAreaMessage } from "@workadventure/messages";
import { MAP_STORAGE_API_TOKEN } from "../../Enum/EnvironmentVariable";

const limit = pLimit(10);
//TODO : move instance
//TODO : whitelist ressourcesUrl;
export const _axios = axios.create({
    headers: {
        Authorization: MAP_STORAGE_API_TOKEN,
    },
});

export class UpdateAreaMapStorageCommand extends UpdateAreaCommand {
    constructor(
        gameMap: GameMap,
        dataToModify: AtLeast<AreaData, "id">,
        commandId: string | undefined,
        oldConfig: AtLeast<AreaData, "id"> | undefined,
        //TODO : RENAME
        private backAddress: string
    ) {
        super(gameMap, dataToModify, commandId, oldConfig);
    }

    public async execute(): Promise<void> {
        this;
        const patch = jsonpatch.compare(this.oldConfig, this.newConfig);
        let shouldNotifyUpdate = false;
        const promises = patch.reduce((acc: Promise<void>[], operation) => {
            if (operation.op === "add" && operation.path.match(new RegExp("^/properties/*"))) {
                const { ressourceUrl, id } = operation.value as AreaDataProperty;
                if (!ressourceUrl) {
                    return acc;
                }

                //TODO : try to do without as
                if ((operation.value as AreaDataProperty).serverData)
                    (operation.value as AreaDataProperty).serverData = undefined;

                const propertyFromNewConfig = this.newConfig.properties?.find((property) => property.id === id);

                if (propertyFromNewConfig) propertyFromNewConfig.serverData = undefined;
                acc.push(
                    limit(async () => {
                        const response = await _axios.post(ressourceUrl, operation.value);
                        if (!response.data) {
                            return Promise.resolve();
                        }

                        const isAreaDataProperty = AreaDataProperty.safeParse(response.data);

                        if (!isAreaDataProperty.success) {
                            return Promise.resolve();
                        }

                        shouldNotifyUpdate = true;

                        this.newConfig.properties = this.newConfig.properties?.map((property) => {
                            if (property.id !== id || !isAreaDataProperty.data.serverData) {
                                //property.serverData = undefined;
                                return property;
                            }

                            shouldNotifyUpdate = true;

                            return isAreaDataProperty.data;
                        });

                        return Promise.resolve();
                    })
                );
            }

            if (operation.op === "remove" && operation.path.match(new RegExp("^/properties/*"))) {
                const value = jsonpatch.getValueByPointer(this.oldConfig, operation.path) as AreaDataProperty;
                if (!value) return acc;
                const ressourceUrl = value.ressourceUrl;
                if (ressourceUrl) {
                    acc.push(limit(() => _axios.delete(ressourceUrl, { data: value })));
                }
            }

            if (operation.op === "replace" && operation.path.match(new RegExp("^/properties/*"))) {
                const match = operation.path.match(/^\/properties\/(\d+)\/*/);

                if (!match) return acc;

                const propertyIndex = Number(match[1]);
                const properties = this.newConfig.properties;

                if (!properties) return acc;
                const property = properties[propertyIndex];
                //recuperer la valeur en cache
                const serverData = this.gameMap
                    .getGameMapAreas()
                    ?.getArea(this.oldConfig.id)
                    ?.properties.find((propertyToFind) => propertyToFind.id === property.id)?.serverData;

                console.log({ operation });
                property.serverData = serverData;
                const ressourcesUrl = property.ressourceUrl;

                if (ressourcesUrl) {
                    acc.push(limit(() => _axios.patch(ressourcesUrl, property)));
                }
                //manage changement des server data
            }
            return acc;
        }, []);

        try {
            await Promise.all(promises);
            if (shouldNotifyUpdate) {
                this.notifyAreaUpdate();
            }
        } catch (e) {
            //TODO : better error management
            console.error("Failed to execute all request on ressourceUrl", e);
        }

        return super.execute();
    }
    private notifyAreaUpdate() {
        const modifyAreaMessage: ModifyAreaMessage = ModifyAreaMessage.fromPartial({
            id: this.newConfig.id,
            //id: this.newConfig.id,
            properties: this.newConfig.properties,
            modifyProperties: true,
        });

        const message: DispatchModifyAreaRequest = DispatchModifyAreaRequest.fromPartial({
            modifyAreaMessage,
        });

        const roomManager = new RoomManagerClient(this.backAddress, grpc.credentials.createInsecure());

        roomManager.dispatchModifyAreaMessage(message, (error) => {
            //sentry
            if (error) console.error("error dans le dispatch");
        });
    }
}
