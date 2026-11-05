import React from 'react'
export default function Panel({ title, right, children }:{title:string, right?:React.ReactNode, children?:React.ReactNode}){
  return (<div className="card">
    <div className="card-h flex items-center justify-between">
      <div>{title}</div>
      <div>{right}</div>
    </div>
    <div className="card-c">{children}</div>
  </div>)
}
