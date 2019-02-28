import { Component, OnInit, Input } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { Ship } from './ship';
import { Container } from './container';
import { ViewChild, ElementRef } from '@angular/core';
import { FleetService } from '../fleet.service';
import { Router } from '@angular/router';
import { Problem } from './problem';
import { shipPosition} from './shipPosition';
import { switchMap, takeUntil, map, catchError } from  'rxjs/operators';
import { timer, Observable, Subject, of, throwError, Subscription } from 'rxjs';

declare let L;

async function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

@Component({
  selector: 'app-ship',
  templateUrl: './ship.component.html',
  styleUrls: ['./ship.component.css']
})
export class ShipComponent implements OnInit {

  ship: Ship;
  img: HTMLImageElement;
  canvasH:number = 200;
  canvasW:number = 230;

  problemUrl: string = "http://localhost:3010/api/problem";
  shipPositionUrl: string = "http://localhost:3010/api/shipposition";
  headers: HttpHeaders = new HttpHeaders({ 'Content-Type': 'application/json' });
  problems: Problem[] = [];
  containers: Container[] = [];
  message: string;
  probString: string[] =[];
  shipPositionString: string[] = [];
  subscription: Subscription;
  shipPositionSubscription: Subscription;

  @ViewChild('myCanvas') myCanvas: ElementRef;
  public context: CanvasRenderingContext2D;

  basicIcon:L.Icon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.2.0/images/marker-icon.png'
  });

   greenIcon = new L.Icon({
     iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
     shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
     iconSize: [25, 41],
     iconAnchor: [12, 41],
     popupAnchor: [1, -34],
     shadowSize: [41, 41]
   });

  constructor(private router: Router, private service: FleetService, private http: HttpClient) {
    this.ship = this.service.getSelectedShip();
    const rows = this.ship.maxRow;
    const cols = this.ship.maxColumn;
    this.img= new Image();
    this.img.src = 'assets/images/ship2.png';
  }

  ngAfterViewInit(): void {
    this.context = (<HTMLCanvasElement>this.myCanvas.nativeElement).getContext('2d');
    this.img.onload = ()=> {
    this.context.drawImage(this.img, 0, this.canvasH-80,220,80);
  }
    this.draw();
  }

  draw() {
    this.context.clearRect(0, 0, this.canvasW, this.canvasH);
    this.context.drawImage(this.img, 0, this.canvasH-80,220,80);
    this.drawMatrix();
  }

  ngOnInit(){
    const map = L.map('map').setView([37.8044, -122.2711], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var marker = new L.marker([this.ship.latitude, this.ship.longitude],{icon: this.basicIcon,title: this.ship.name});
    map.addLayer(marker);
    marker.bindPopup("<b>"+this.ship.name+"</b>").openPopup();

    async function wait() {
      console.log("I am in ship position simulation");
      await delay(15000);
    }

    this.shipPositionSubscription = timer(0, 50000).pipe(
      switchMap(() => this.listenToShipPositionEvent())
    ).subscribe(data => {
      console.log("I am in subscribe of ship position data");
      this.shipPositionString = data;
      console.log("listen to ship position event"+this.shipPositionString);
      wait().then(()=>{
        console.log("data is old"+this.shipPositionString);
            for(var k = 0; k < this.shipPositionString.length; k++){
              var x = this.shipPositionString[k];
              var shipPos : shipPosition = JSON.parse(x);
              if (this.ship.name == shipPos.shipID){
                this.ship.latitude = shipPos.latitude;
                this.ship.longitude = shipPos.longitude;
                if (marker) {
                  map.removeLayer(marker);
                }
                marker = new L.marker([this.ship.latitude, this.ship.longitude],{icon: this.basicIcon,title: this.ship.name});
                map.addLayer(marker);
                marker.bindPopup("<b>"+this.ship.name+"</b>").openPopup();
              }
            }
      }).catch((error)=>{
        console.log(error);
      });
    }, error => {
      this.message = "Error retrieving ship position";
    });



  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /*
  Call back so when the simulation is started the ship component can start listening to problem or containers
  The ship instance now has loaded containers.
  */
  doneSimul(){
    this.ship = this.service.getSelectedShip();

    async function wait() {
      console.log("I am in wait simulation");
      await delay(15000);
    }

    this.subscription = timer(0, 50000).pipe(
      switchMap(() => this.listenToContainerOrProblem())
    ).subscribe(data => {
      console.log("I am in subscribe of problemdata");
      this.probString = data;
      console.log("listen to container problem"+this.probString);
      wait().then(()=>{
        console.log("data is old"+this.probString);
        var topRow = this.ship.containers.length-1;
        for(var i=topRow; i >= 0; --i){
          let row = this.ship.containers[i];
          for(var j=0; j <= row.length -1; j++){
            for(var k = 0; k< this.probString.length; k++){
              var x = this.probString[k];
              var prob : Problem = JSON.parse(x);
              if (prob.containerId == this.ship.containers[i][j].id){
                this.ship.containers[i][j].status = prob.issue;
                if(prob.issue === 'FIRE' || prob.issue === 'HEAT' || prob.issue === 'DOWN'){

                  var found = this.problems.some(function (el) {
                    return el.containerId === prob.containerId && el.issue === prob.issue && el.shipId === prob.shipId && el.status === prob.status;
                  });

                  var foundWithDiffStatus = this.problems.some(function (el) {
                    return el.containerId === prob.containerId && el.issue != prob.issue && el.shipId === prob.shipId && el.status === prob.status;
                  });

                  if (found) {
                    console.log("Same element already exists");
                  }
                  else if (foundWithDiffStatus) {
                    const objPosition = this.problems.map(function(e) { return e.containerId; }).indexOf(prob.containerId);
                    this.problems.splice(objPosition, 1);
                    this.problems.push(prob);
                  }
                  else{
                    this.problems.push(prob);
                  }

                }
                else{
                  var issuecleared = this.problems.some(function (el) {
                    return el.containerId === prob.containerId && el.shipId === prob.shipId && el.status === prob.status;
                  });
                  if (issuecleared) {
                    const objPosition = this.problems.map(function(e) { return e.containerId; }).indexOf(prob.containerId);
                    this.problems.splice(objPosition, 1);
                  }
                }
              }
            }
          }
        }
        this.draw();
      }).catch((error)=>{
        console.log(error);
      });
    }, error => {
      this.message = "Error retrieving problems";
    });

  }

  listenToContainerOrProblem(){
    // call BFF to get problems and container update
    console.log("In the listener problem");
      return this.http.get<string[]>(this.problemUrl)
      .pipe(map(data => {
        this.probString = data;
        return this.probString;
      }))

  }

  listenToShipPositionEvent(){
    // call BFF to get ship position status
    console.log("In the listener for ship position");
    return this.http.get<string[]>(this.shipPositionUrl)
    .pipe(map(data => {
      this.shipPositionString = data;
      return this.shipPositionString;
    }))
  }

  back() {
    this.router.navigate(['fleets']);
  }


  drawMatrix() {
    var cellWt = 180 / (this.ship.maxColumn+1);
    var cellHt = 180 / (this.ship.maxRow+1);
    var topRow = this.ship.containers.length-1;
    for(var i=topRow; i >= 0; --i){
      let y = this.canvasH - 20 - (i+1) * cellHt;
      let row = this.ship.containers[i];
      for(var j=0; j <= row.length -1; j++){
        let x = 30 + (j+1)* cellWt;
        let container: Container = row[j];
        this.generateBorder(x, y, cellWt, cellHt);
        this.context.fillStyle = this.containerColor(container.status);
        this.context.fillRect(x , y , cellWt, cellHt);
      }
    }
  }

  containerColor(value) {
    if(value == 'empty'){
      return 'white';
    }
    if(value == 'FIRE'){
      return 'darkorange';
    }
    if(value == 'HEAT'){
      return 'crimson';
    }
    if(value == 'DOWN'){
      return 'red';
    }
    return 'grey';
  }

  generateBorder(cellWt, cellHt, cellwidth, cellheight, thick = 1) {
    this.context.fillStyle='#000';
    this.context.fillRect(cellWt - (thick), cellHt - (thick), cellwidth + (thick * 2), cellheight + (thick * 2));
  }



}
