/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Entity,
  parseEntityRef,
  RELATION_MEMBER_OF,
} from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/core-app-api';
import { TableColumn, TableProps } from '@backstage/core-components';
import {
  ConfigApi,
  configApiRef,
  IdentityApi,
  identityApiRef,
  storageApiRef,
} from '@backstage/core-plugin-api';
import {
  CatalogTableRow,
  DefaultStarredEntitiesApi,
} from '@backstage/plugin-catalog';
import {
  CatalogApi,
  catalogApiRef,
  entityRouteRef,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import {
  MockStorageApi,
  TestApiProvider,
  wrapInTestApp,
} from '@backstage/test-utils';
import DashboardIcon from '@material-ui/icons/Dashboard';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { apiDocsConfigRef } from '../../config';
import { DefaultApiExplorerPage } from './DefaultApiExplorerPage';

describe('DefaultApiExplorerPage', () => {
  const mockedEntityFacets = jest.fn();
  const mockedGetEntities = jest.fn();
  const mockedGetBackstageIdentity = jest.fn();

  const catalogApi: Partial<CatalogApi> = {
    getEntities: mockedGetEntities,
    getLocationByRef: () =>
      Promise.resolve({ id: 'id', type: 'url', target: 'url' }),
    getEntityByRef: async entityRef => {
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: { name: parseEntityRef(entityRef).name },
        relations: [
          {
            type: RELATION_MEMBER_OF,
            targetRef: 'group:default/tools',
            target: { namespace: 'default', kind: 'group', name: 'tools' },
          },
        ],
      };
    },
    getEntityFacets: mockedEntityFacets,
  };

  const identityApi: Partial<IdentityApi> = {
    getBackstageIdentity: mockedGetBackstageIdentity,
  };

  const configApi: ConfigApi = new ConfigReader({
    organization: {
      name: 'My Company',
    },
  });

  const apiDocsConfig = {
    getApiDefinitionWidget: () => undefined,
  };

  const storageApi = MockStorageApi.create();

  const renderWrapped = (children: React.ReactNode) =>
    render(
      wrapInTestApp(
        <TestApiProvider
          apis={[
            [catalogApiRef, catalogApi],
            [configApiRef, configApi],
            [storageApiRef, storageApi],
            [
              starredEntitiesApiRef,
              new DefaultStarredEntitiesApi({ storageApi }),
            ],
            [apiDocsConfigRef, apiDocsConfig],
            [identityApiRef, identityApi],
          ]}
        >
          {children}
        </TestApiProvider>,
        {
          mountedRoutes: {
            '/catalog/:namespace/:kind/:name': entityRouteRef,
          },
        },
      ),
    );

  beforeEach(() => {
    mockedEntityFacets.mockImplementation(async () => {
      return {
        facets: {
          'metadata.uid': [{ count: 1, value: 'uid' }],
          'metadata.name': [],
          'relations.ownedBy': [{ count: 1, value: 'group:default/a-group' }],
        },
      };
    });

    mockedGetEntities.mockImplementation(() =>
      Promise.resolve({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'API',
            metadata: {
              name: 'Entity1',
            },
            spec: { type: 'openapi' },
          },
        ] as Entity[],
      }),
    );

    mockedGetBackstageIdentity.mockImplementation(async () => ({
      ownershipEntityRefs: ['user:default/someone'],
      type: 'user',
      userEntityRef: 'user:default/someone',
    }));
  });

  // this test right now causes some red lines in the log output when running tests
  // related to some theme issues in mui-table
  // https://github.com/mbrn/material-table/issues/1293
  it('should render', async () => {
    const { findByText } = renderWrapped(<DefaultApiExplorerPage />);
    expect(await findByText(/My Company API Explorer/)).toBeInTheDocument();
  });

  it('should render the default column of the grid', async () => {
    const { getAllByRole } = renderWrapped(<DefaultApiExplorerPage />);

    const columnHeader = getAllByRole('button').filter(
      c => c.tagName === 'SPAN',
    );
    const columnHeaderLabels = columnHeader.map(c => c.textContent);

    await waitFor(() =>
      expect(columnHeaderLabels).toEqual([
        'Name',
        'System',
        'Owner',
        'Type',
        'Lifecycle',
        'Description',
        'Tags',
        'Actions',
      ]),
    );
  });

  it('should render the custom column passed as prop', async () => {
    const columns: TableColumn<CatalogTableRow>[] = [
      { title: 'Foo', field: 'entity.foo' },
      { title: 'Bar', field: 'entity.bar' },
      { title: 'Baz', field: 'entity.spec.lifecycle' },
    ];
    const { getAllByRole } = renderWrapped(
      <DefaultApiExplorerPage columns={columns} />,
    );

    const columnHeader = getAllByRole('button').filter(
      c => c.tagName === 'SPAN',
    );
    const columnHeaderLabels = columnHeader.map(c => c.textContent);

    await waitFor(() =>
      expect(columnHeaderLabels).toEqual(['Foo', 'Bar', 'Baz', 'Actions']),
    );
  });

  it('should render the default actions of an item in the grid', async () => {
    const { findByTitle, getByText } = await renderWrapped(
      <DefaultApiExplorerPage />,
    );
    await waitFor(() => getByText(/All \(1\)/));
    expect(await findByTitle(/View/)).toBeInTheDocument();
    expect(await findByTitle(/View/)).toBeInTheDocument();
    expect(await findByTitle(/Edit/)).toBeInTheDocument();
    expect(await findByTitle(/Add to favorites/)).toBeInTheDocument();
  });

  it('should render the custom actions of an item passed as prop', async () => {
    const actions: TableProps<CatalogTableRow>['actions'] = [
      () => {
        return {
          icon: () => <DashboardIcon fontSize="small" />,
          tooltip: 'Foo Action',
          disabled: false,
          onClick: () => jest.fn(),
        };
      },
      () => {
        return {
          icon: () => <DashboardIcon fontSize="small" />,
          tooltip: 'Bar Action',
          disabled: true,
          onClick: () => jest.fn(),
        };
      },
    ];

    const { findByTitle, findByText, getByText, getByTestId } =
      await renderWrapped(<DefaultApiExplorerPage actions={actions} />);

    await waitFor(() => getByText('Entity1'));
    expect(await findByText(/All \(1\)/)).toBeInTheDocument();
    expect(await findByTitle(/Foo Action/)).toBeInTheDocument();
    expect(await findByTitle(/Bar Action/)).toBeInTheDocument();

    await waitFor(() => getByTestId('user-picker-owned'));
    await waitFor(() => expect(mockedGetEntities).toHaveBeenCalled());
    await waitFor(() => expect(mockedGetBackstageIdentity).toHaveBeenCalled());
    await waitFor(() => expect(mockedEntityFacets).toHaveBeenCalled());
  });
});
