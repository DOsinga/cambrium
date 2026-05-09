unit uGrid;

interface

uses
    uCreature;

type
     TFindMethod = procedure( This, Other : TCreature ) of object;

function CountCreaturesInGrid : Integer;
procedure PutCreature( C : TCreature; X,Y : Single );
procedure DeleteCreature( C : TCreature; X,Y : Single );
procedure MoveCreature( C : TCreature; oldX,oldY, newX,newY : Single );
procedure FindCreatures( This : TCreature;
                         X1,Y1,X2,Y2 : Single;
                         Fun : TFindMethod );

implementation

const
    kMinX = -250;
    kMaxX =  250;
    kMinY = -250;
    kMaxY =  250;

    kScale = 0.02; {Grid cel = 50 pixels}

var
    gGrid : array[kMinX..kMaxX,kMinY..kMaxY] of TCreatureList;
//    TempList : TCreatureList;

procedure CooToGrid( Xin,Yin : Single; var XOut, YOut : Integer );
begin
    Xout := Round(Xin*kScale);
    Yout := Round(Yin*kScale);
    if (Xout<kMinX) then Xout := kMinX
    else if (Xout>kMaxX) then Xout := kMaxX;
    if (Yout<kMinY) then Yout := kMinY
    else if (Yout>kMaxY) then Yout := kMaxY;
end;

procedure PutCreature( C : TCreature; X,Y : Single );
var
    iX,iY : Integer;
begin
    CooToGrid(X,Y, iX,iY);
    with gGrid[iX,iY] do
        if IndexOf(C)=-1 then
            Add(C);
end;

procedure DeleteCreature( C : TCreature; X,Y : Single );
var
    iX,iY : Integer;
begin
    CooToGrid(X,Y, iX,iY);
    with gGrid[iX,iY] do
        Remove(C);
end;

procedure MoveCreature( C : TCreature; oldX,oldY, newX,newY : Single );
var
    ioldX,ioldY, inewX,inewY : Integer;
begin
    CooToGrid(oldX,oldY, ioldX,ioldY);
    CooToGrid(newX,newY, inewX,inewY);
    if (ioldX<>inewX) or (ioldY<>inewY) then begin
        with gGrid[ioldX,ioldY] do
            Remove(C);
        with gGrid[inewX,inewY] do
            if IndexOf(C)=-1 then
                Add(C);
    end;
end;

const
    Counts : Integer = 0;
    Squares : Integer = 0;
    Creatures : Integer = 0;

procedure  FindCreatures( This : TCreature;
                          X1,Y1,X2,Y2 : Single;
                          Fun : TFindMethod );
var
    iX1,iX2,iY1,iY2 : Integer;
    iX,iY,I : Integer;
begin
    Inc( Counts );
    CooToGrid(X1,Y1, iX1,iY1 );
    CooToGrid(X2,Y2, iX2,iY2 );
    for iX := iX1 to iX2 do
        for iY := iY1 to iY2 do begin
           Inc( Squares );
           I := 0;
           while I <gGrid[iX,iY].Count do with gGrid[iX,iY] do begin
               Inc( Creatures );
               with Items[I] do begin
                    if (Items[I]<>This) and (XPos>=X1) and (XPos<=X2) and (YPos>=Y1) and (YPos<=Y2) then begin
                        Fun(This, Items[I]);
                    end;
               end;
               Inc(I);
           end;
        end;
end;

function CountCreaturesInGrid : Integer;
var
   X,Y : Integer;
begin
   Result := 0;
   for Y := kMinY to kMaxY do
       for X := kMinX to kMaxX do
           Inc( Result, gGrid[X,Y].Count );
end;

var
    X,Y : Integer;

initialization
   for Y := kMinY to kMaxY do
       for X := kMinX to kMaxX do begin
           gGrid[X,Y] := TCreatureList.Create;
       end;

finalization
   for Y := kMinY to kMaxY do
       for X := kMinX to kMaxX do begin
           gGrid[X,Y].Free;
       end;

end.
