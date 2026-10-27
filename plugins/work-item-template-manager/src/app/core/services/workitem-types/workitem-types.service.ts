import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { IWorkItemTypeDefinition } from '../../models/workitem-type.models';
import { WorkItemTypesHttpService } from '../workitem-types-http/workitem-types-http.service';

@Injectable({
  providedIn: 'root',
})
export class WorkItemTypesService {
  public constructor(private readonly workItemTypesHttpService: WorkItemTypesHttpService) {}

  public getWorkItemTypes(): Observable<IWorkItemTypeDefinition[]> {
    return this.workItemTypesHttpService
      .getWorkItemTypes()
      .pipe(map((response) => response.workItemTypes ?? []));
  }
}
