import { expect, test } from "@playwright/test";
import Map from "./utils/map";
import { resetWamMaps } from "./utils/map-editor/uploader";
import MapEditor from "./utils/mapeditor";
import Menu from "./utils/menu";
import { login } from "./utils/roles";
import { map_storage_url } from "./utils/urls";
import {
  oidcAdminTagLogin,
  oidcLogout,
  oidcMemberTagLogin,
} from "./utils/oidc";
import EntityEditor from "./utils/map-editor/entityEditor";
import AreaAccessRights from "./utils/areaAccessRights";
import { evaluateScript } from "./utils/scripting";

test.setTimeout(240_000); // Fix Webkit that can take more than 60s
test.use({
  baseURL: map_storage_url,
});

test.describe("Map editor area with rights @oidc @serial", () => {
  //need to use .wam map
  test.describe.configure({mode:"serial"});
  test.beforeEach(
    "Ignore tests on mobilechromium because map editor not available for mobile devices",
    ({}, { project }) => {
      //Map Editor not available on mobile
      if (project.name === "mobilechromium") {
        //eslint-disable-next-line playwright/no-skipped-test
        test.skip();
        return;
      }
    }
  );

  test.beforeEach(
    "Ignore tests on webkit because of issue with camera and microphone",
    ({ browserName }) => {
      //WebKit has issue with camera
      if (browserName === "webkit") {
        //eslint-disable-next-line playwright/no-skipped-test
        test.skip();
        return;
      }
    }
  );

  test("Successfully set Area with right access", async ({ page, request }, {
    project,
  }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 2, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["admin"]
    );
    await Menu.closeMapEditor(page);
    const anonymLoginPromise = page.waitForResponse(
      (response) =>
        response.url().includes("anonymLogin") && response.status() === 200
    );
    await oidcLogout(page, false);

    await anonymLoginPromise;

    await Map.walkTo(page, "ArrowRight", 500);
    await Map.walkTo(page, "ArrowUp", 1000);

    await expect(
      page.getByText("Sorry, you don't have access to this area")
    ).toBeAttached();
  });

  test("Access restricted area with right click to move", async ({
    page,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 2, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["admin"]
    );
    await Menu.closeMapEditor(page);
    const anonymLoginPromise = page.waitForResponse(
      (response) =>
        response.url().includes("anonymLogin") && response.status() === 200
    );
    await oidcLogout(page, false);

    await anonymLoginPromise;

    const userCurrentPosition = await evaluateScript(page, async () => {
      return await WA.player.getPosition();
    });

    await page.mouse.click(
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y,
      { button: "right" }
    );

    //Need to wait for player move action
    // eslint-disable-next-line
    await page.waitForTimeout(1000);

    const actualPositionAfterRightClickToMove = await evaluateScript(
      page,
      async () => {
        return await WA.player.getPosition();
      }
    );

    expect(userCurrentPosition).toEqual(actualPositionAfterRightClickToMove);
  });

  test("MapEditor is disabled for basic user because there are no thematics", async ({
    page,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 2, "en-US", project.name === "mobilechromium");

    await Menu.openMapEditor(page);

    const entityEditorButton = await page.locator(
      "section.side-bar-container .side-bar .tool-button button#EntityEditor"
    );
    await expect(entityEditorButton).not.toBeAttached();
  });

  test("Area with restricted write access : Trying to read an object", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 2, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["admin"]
    );
    await AreaAccessRights.openEntityEditorAndAddEntityWithOpenLinkPropertyInsideArea(
      page
    );
    await oidcLogout(page, false);

    // Expect user in other page to not have the right
    // to read the object
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(".actions-menu .actions button").nth(0)
    ).not.toBeAttached();
  });

  test("Area with restricted write access : Trying to read an object with read/write access", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["member"]
    );
    await AreaAccessRights.openEntityEditorAndAddEntityWithOpenLinkPropertyInsideArea(
      page
    );
    await oidcLogout(page, false);

    // Expect user in other page to not have the right
    // to read the object
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(".actions-menu .actions button").nth(0)
    ).toContainText("Open Link");
  });

  test("Area with restricted write access : Trying to add an object", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["admin"]
    );
    await oidcLogout(page, false);

    // From browser 2
    // Select entity and push it into the map
    // Expect to not have the entity property editor
    // by clicking on the entity position
    await Menu.openMapEditor(page2);
    await MapEditor.openEntityEditor(page2);
    await EntityEditor.selectEntity(page2, 0, "small table");
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.entityPositionInArea.x,
      AreaAccessRights.entityPositionInArea.y
    );
    await EntityEditor.clearEntitySelection(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(
        ".map-editor .sidebar .properties-buttons .add-property-button",
        { hasText: "Open Link" }
      )
    ).not.toBeAttached();
  });

  test("Area with restricted write access : Trying to add an object with write access", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["member"],
      []
    );
    await oidcLogout(page, false);

    // From browser 2
    // Select entity and push it into the map
    // Expect to not have the entity property editor
    // by clicking on the entity position
    await Menu.openMapEditor(page2);
    await MapEditor.openEntityEditor(page2);
    await EntityEditor.selectEntity(page2, 0, "small table");
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await EntityEditor.clearEntitySelection(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(
        ".map-editor .sidebar .properties-buttons .add-property-button",
        { hasText: "Open Link" }
      )
    ).toBeAttached();
  });

  test("Area with restricted write access : Trying to remove an object", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      ["member"]
    );
    await AreaAccessRights.openEntityEditorAndAddEntityWithOpenLinkPropertyInsideArea(
      page
    );
    await oidcLogout(page, false);

    // From browser 2
    // Try to remove entity and click on it to
    // check if removed or not
    // Expected not to be removed
    await Menu.openMapEditor(page2);
    await MapEditor.openTrashEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await Menu.closeMapEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(".actions-menu .actions button").nth(0)
    ).toContainText("Open Link");
  });

  test("Area with restricted write access : Trying to remove an object with write access", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["member"],
      []
    );
    await AreaAccessRights.openEntityEditorAndAddEntityWithOpenLinkPropertyInsideArea(
      page
    );
    await oidcLogout(page, false);

    // From browser 2
    // Try to remove entity and click on it to
    // check if removed or not
    // Expected to be removed
    await Menu.openMapEditor(page2);
    await MapEditor.openTrashEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await Menu.closeMapEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );

    await expect(
      page2.locator(".actions-menu .actions button").nth(0)
    ).not.toBeAttached();
  });

  test("Area with restricted write access : Trying to remove an object outside the area", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Add area with admin rights
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddAreaWithRights(
      page,
      ["admin"],
      []
    );
    await AreaAccessRights.openEntityEditorAndAddEntityWithOpenLinkPropertyOutsideArea(
      page
    );
    await oidcLogout(page, false);

    // From browser 2
    // Try to remove entity and click on it to
    // check if removed or not
    // Expected to be removed
    await Menu.openMapEditor(page2);
    await MapEditor.openTrashEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityOutsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityOutsideArea.y
    );
    await Menu.closeMapEditor(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityOutsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityOutsideArea.y
    );

    await expect(
      page2.locator(".actions-menu .actions button").nth(0)
    ).toContainText("Open Link");
  });

  test("Claim personal area from allowed user", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddArea(page);
    await page.getByTestId("personalAreaPropertyData").click();
    await page.getByTestId("allowedTags").fill("member");
    await page.press("body", "Enter");
    await oidcLogout(page, false);

    await page.close();

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");
    await oidcMemberTagLogin(page2);

    // Move to area and claim it
    await Map.teleportToPosition(
      page2,
      AreaAccessRights.entityPositionInArea.x,
      AreaAccessRights.entityPositionInArea.y
    );
    await page2.getByTestId("claimPersonalAreaButton").click();

    await Menu.openMapEditor(page2);
    await EntityEditor.selectEntity(page2, 0, "small table");
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await EntityEditor.clearEntitySelection(page2);
    await EntityEditor.moveAndClick(
      page2,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.x,
      AreaAccessRights.mouseCoordinatesToClickOnEntityInsideArea.y
    );
    await expect(
      page2.locator(
        ".map-editor .sidebar .properties-buttons .add-property-button",
        { hasText: "Open Link" }
      )
    ).toBeAttached();
  });

  test("Claim personal area from unauthorized user", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddArea(page);
    await page.getByTestId("personalAreaPropertyData").click();
    await page.getByTestId("allowedTags").fill("member");
    await page.press("body", "Enter");
    await oidcLogout(page, false);

    await page.close();

    // Second browser with member user trying to read the object
    const newBrowser = await browser.browserType().launch({});
    const page2 = await newBrowser.newPage();
    await page2.goto(Map.url("empty"));
    await login(page2, "test2", 5, "en-US", project.name === "mobilechromium");

    // Move to area and claim it
    await Map.teleportToPosition(
      page2,
      AreaAccessRights.entityPositionInArea.x,
      AreaAccessRights.entityPositionInArea.y
    );
    await expect(
      page2.getByTestId("claimPersonalAreaButton")
    ).not.toBeAttached();
  });

  test("Claim multi personal area", async ({
    page,
    browser,
    request,
  }, { project }) => {
    await resetWamMaps(request);

    await page.goto(Map.url("empty"));
    await login(page, "test", 3, "en-US", project.name === "mobilechromium");
    await oidcAdminTagLogin(page, false);

    // Add a first area
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddArea(page);
    await page.getByTestId("personalAreaPropertyData").click();
    await Menu.closeMapEditor(page);

    // Add a second area
    await Menu.openMapEditor(page);
    await AreaAccessRights.openAreaEditorAndAddArea(
      page,
      { x: 1 * 32, y: 10 * 32 },
      { x: 9 * 32, y: 19 * 32 },
    );
    await page.getByTestId("personalAreaPropertyData").click();
    await Menu.closeMapEditor(page);

    // Try to claim the area
    await Map.rightClickToPosition(page, 6 * 32 + 10, 3 * 32 + 10);
    await page.getByTestId("claimPersonalAreaButton").click();

    // Check if the second area is claimable
    await Map.rightClickToPosition(page, 6 * 32 + 10, 12 * 32 + 10);
    await page.getByTestId("claimPersonalAreaButton").click();

    // Check if the first area is not claimable
    await Map.rightClickToPosition(page, 6 * 32 + 10, 3 * 32 + 10);
    await expect(
      page.getByTestId("claimPersonalAreaButton")
    ).not.toBeAttached();
  });
});
