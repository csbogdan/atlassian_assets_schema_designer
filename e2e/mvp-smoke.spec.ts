import { expect, test } from '@playwright/test';

test.describe('MVP smoke', () => {
  test('renders interactive shell and navigates between key views', async ({ page }) => {
    const pageErrors: string[] = [];
    const nav = page.locator('aside');
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'JSM Assets Schema Designer' })).toBeVisible();
    await expect(page.getByText('Navigation')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Dashboard' })).toBeVisible();

    await nav.getByRole('button', { name: 'Schema' }).click();
    await expect(page.getByRole('heading', { name: 'Schema Explorer' })).toBeVisible();

    await nav.getByRole('button', { name: 'Mapping' }).click();
    await expect(page.getByRole('heading', { name: 'Mapping Explorer' })).toBeVisible();

    await nav.getByRole('button', { name: 'Validation' }).click();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();

    await nav.getByRole('button', { name: 'Raw JSON' }).click();
    await expect(page.getByRole('heading', { name: 'Raw JSON' })).toBeVisible();

    await nav.getByRole('button', { name: 'Generator' }).click();
    await expect(page.getByRole('heading', { name: 'Mapping Generator' })).toBeVisible();

    await nav.getByRole('button', { name: 'Diff' }).click();
    await expect(page.getByRole('heading', { name: 'Diff & Impact Analysis' })).toBeVisible();

    expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('supports critical clickable actions', async ({ page }) => {
    const nav = page.locator('aside');

    await page.goto('/');

    await nav.getByRole('button', { name: 'Validation' }).click();
    const openInJson = page.getByRole('button', { name: 'Open in JSON' }).first();
    const hasOpenInJson = await openInJson.count();

    if (hasOpenInJson > 0) {
      await openInJson.click();
      await expect(page.getByRole('heading', { name: 'Raw JSON' })).toBeVisible();
      await expect(page.getByText('Focused diagnostic path:')).toBeVisible();
    }

    await nav.getByRole('button', { name: 'Schema' }).click();
    const quickGenerate = page.getByRole('button', { name: 'Generate mapping' }).first();
    if (await quickGenerate.isVisible()) {
      await quickGenerate.click();
      await expect(page.getByRole('heading', { name: 'Mapping Explorer' })).toBeVisible();
    }

    await nav.getByRole('button', { name: 'Generator' }).click();
    await expect(page.getByRole('heading', { name: 'Mapping Generator' })).toBeVisible();

    const addMappingButton = page.getByRole('button', { name: 'Add mapping' });
    if (!(await addMappingButton.isDisabled())) {
      await addMappingButton.click();
      await nav.getByRole('button', { name: 'Mapping' }).click();
      await expect(page.getByRole('heading', { name: 'Mapping Explorer' })).toBeVisible();
    }
  });

  test('allows editing selected object and mapping details', async ({ page }) => {
    const nav = page.locator('aside');

    await page.goto('/');

    await nav.getByRole('button', { name: 'Schema' }).click();
    const objectNameInput = page.locator('input[placeholder="Object type name"]').first();
    await expect(objectNameInput).toBeVisible();
    await objectNameInput.fill('Services Edited');
    await expect(objectNameInput).toHaveValue('Services Edited');

    await nav.getByRole('button', { name: 'Mapping' }).click();
    const selectorInput = page.locator('input[placeholder="Selector"]').first();
    await expect(selectorInput).toBeVisible();
    await selectorInput.fill('edited-selector');
    await expect(selectorInput).toHaveValue('edited-selector');
  });

  test('supports expanded graph view with node details', async ({ page }) => {
    const nav = page.locator('aside');

    await page.goto('/');

    await nav.getByRole('button', { name: 'Schema' }).click();
    await page.getByRole('button', { name: 'Graph' }).click();
    await page.getByRole('button', { name: 'Full view' }).click();
    await expect(page.getByRole('heading', { name: 'Schema Graph — Full View' })).toBeVisible();

    const graphNode = page.locator('.react-flow__node').first();
    await expect(graphNode).toBeVisible();
    const nodeExternalId = await graphNode.getAttribute('data-id');
    await graphNode.evaluate((element) => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await expect(page.getByText('Selected node details')).toBeVisible();
    await expect(page.getByText(`External ID: ${nodeExternalId}`)).toBeVisible();

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Schema Graph — Full View' })).toHaveCount(0);
  });

  test('breadcrumbs panel shows outbound links and clicking them snaps to node', async ({ page }) => {
    const nav = page.locator('aside');

    await page.goto('/');
    await nav.getByRole('button', { name: 'Schema' }).click();

    // ensure search/depth controls are removed
    await expect(page.locator('input[placeholder="Search object types"]').count()).resolves.toEqual(0);
    await expect(page.locator('select').filter({ hasText: 'All depths' }).count()).resolves.toEqual(0);

    // click the "Users" tree item (sample data contains outbound ref to Company)
    const usersButton = page.getByRole('button', { name: 'Users' }).first();
    await usersButton.click();

    // outbound chip should appear
    const outboundChip = page.getByRole('button', { name: 'Company' }).first();
    await expect(outboundChip).toBeVisible();

    // clicking it should open the graph and center on the company node
    await outboundChip.click();
    await expect(page.getByRole('heading', { name: 'Schema Graph — Full View' })).toBeVisible();
    // verify selected node name appears in panel
    await expect(page.getByText('External ID: cmdb-company')).toBeVisible();
  });
});
